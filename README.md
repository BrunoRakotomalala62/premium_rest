# premium_rest

REST API **serverless (Vercel)** au-dessus de l'API [CodeCraft](https://codecraftapi.com/docs)
(compatible OpenAI), avec :

- 💬 **conversation continue** — l'historique est conservé côté serveur par `uid` ;
- 🖼️ **vision** — analyse d'images par URL ;
- 🤖 **33 modèles récents** — Claude 5 / Opus 5, Claude Mythos, GPT‑5.6 Luna / Terra / Sol, Gemini 3.7, Grok 4.6, DeepSeek‑V4…

Aucune dépendance npm : le projet n'utilise que le `fetch` natif, donc déploiement Vercel instantané.

> **Runtime : Edge.** Les handlers tournent en **Vercel Edge Functions** (`export const config = { runtime: 'edge' }`).
> C'est volontaire : l'API CodeCraft est derrière Cloudflare, qui renvoie un `403 cf-mitigated: challenge`
> aux IP du runtime Node (Lambda/AWS) de Vercel. L'egress Edge de Vercel, lui, passe. Ne repassez pas les
> handlers en runtime Node sans avoir vérifié ce point.

---

## Routes

| Méthode | Route | Description |
| ------ | ----- | ----------- |
| `GET` | `/api/ai?prompt=bonjour&uid=123` | Chat avec **mémoire de conversation** par `uid` |
| `GET` | `/api/vision?prompt=décrivez bien cette photo&image=URL_IMAGE&model=...&uid=123` | Analyse d'image |
| `GET` | `/api/ai?prompt=...&image=URL_IMAGE&uid=123` | Identique à `/api/vision` (raccourci) |
| `GET` | `/api/models` | Liste des modèles (+ alias et capacités vision) |
| `GET` | `/api/reset?uid=123` | Efface la conversation d'un `uid` |
| `GET` | `/api/keys` | État des clés CodeCraft (rotation) — labels masqués |
| `GET` | `/` ou `/api` | Auto-documentation JSON |

Des réécritures sont fournies dans `vercel.json` : `/ai`, `/vision`, `/models`, `/reset`
pointent vers les mêmes handlers sans le préfixe `/api`.

### Paramètres

| Param | Requis | Rôle |
| ----- | ------ | ---- |
| `prompt` | oui | Le message envoyé au modèle |
| `uid` | recommandé | Identifiant de conversation. Même `uid` ⇒ suite du contexte |
| `image` | vision | URL publique ou `data:image/...` (plusieurs URLs séparées par des virgules) |
| `model` | non | Id de modèle **ou alias** (voir ci-dessous) |
| `system` | non | Prompt système (chat) |
| `reset=1` | non | Repart d'une conversation vierge pour ce `uid` |
| `nostore=1` | non | Ignore complètement la mémoire |
| `max_tokens` | non | Limite de génération |
| `temperature` | non | 0.0 – 2.0 |

### Modèles

`GET /api/models` renvoie les 33 modèles et leurs capacités. Alias pratiques :

| Alias | Modèle réel |
| ----- | ----------- |
| `claude-5` / `claude` / `opus-5` | `claude-opus-5` |
| `sonnet-5` | `claude-sonnet-5` |
| `mythos` | `claude-mythos-preview` |
| `fable` / `fable-5` | `claude-fable-5` |
| `gpt-5.6` | `gpt-5.6-sol` |
| `luna` | `gpt-5.6-luna` |
| `terra` | `gpt-5.6-terra` |
| `gemini` | `gemini-3.7-flash` |
| `grok` | `grok-4.6` |
| `deepseek` | `deepseek-v4-pro-max` |
| `qwen` | `qwen3.8-max` |
| `kimi` | `kimi-k3` |

Défaut : `claude-opus-5` (texte et vision). 28 modèles sur 33 acceptent les images.

---

## Rotation de clés API (quotas)

Un plan CodeCraft donne ~**1 000 000 de tokens/mois**. Quand ce quota est épuisé,
l'upstream répond `429` / `402` / `403` (ou `401` si la clé est révoquée). Au lieu de
renvoyer une erreur à l'utilisateur, l'API **bascule automatiquement sur la clé suivante**.

### Configurer plusieurs clés

Ajoutez-les dans **Vercel → Project → Settings → Environment Variables**. Elles sont
lues dans cet ordre (les doublons sont ignorés) :

1. `CODECRAFT_API_KEY` / `CODECRAFT_KEY` — clé primaire ;
2. `CODECRAFT_API_KEYS` — liste, séparée par des virgules, points-virgules ou retours à la ligne ;
3. `CODECRAFT_API_KEY_1`, `CODECRAFT_API_KEY_2`, … — emplacements numérotés (jusqu'à
   `CODECRAFT_KEYS_MAX`, défaut 50). `CODECRAFT_KEY_N` marche aussi.

```bash
# Exemple : 3 clés
CODECRAFT_API_KEYS=cc_key1,cc_key2,cc_key3
# équivaut à :
CODECRAFT_API_KEY_1=cc_key1
CODECRAFT_API_KEY_2=cc_key2
CODECRAFT_API_KEY_3=cc_key3
```

> Une seule clé continue de fonctionner exactement comme avant : la rotation est
> automatiquement désactivée (`enabled: false`) et seul l'échec remonte.

### Ce qui déclenche une rotation

| Réponse upstream | Interprétation | Clé mise de côté |
| ---------------- | -------------- | ---------------- |
| `401` | clé invalide / révoquée | 30 min (`KEY_COOLDOWN_INVALID_MS`) |
| `402` | paiement/quota requis | 1 h (`KEY_COOLDOWN_QUOTA_MS`) |
| `403` + message quota | quota épuisé | 1 h |
| `403` sans mot-clé quota | accès refusé (plan/permission) | 15 min (`KEY_COOLDOWN_FORBIDDEN_MS`) |
| `429` + message quota | quota épuisé | 1 h |
| `429` + `Retry-After` | rate limit passager | valeur de `Retry-After`, sinon 1 min (`KEY_COOLDOWN_RATE_MS`) |

Les erreurs **non liées à la clé** (`400` mauvais modèle, `404`, timeout, défi
Cloudflare…) ne consomment **pas** les autres clés : elles sont renvoyées telles quelles.

### Stratégie

`KEY_STRATEGY` :

- `failover` *(défaut)* — on reste sur la dernière clé qui fonctionne ; on ne change
  qu'en cas d'échec. Simple, économique en requêtes.
- `round-robin` — on répartit les requêtes sur toutes les clés pour consommer les
  quotas en parallèle (utile si vous voulez lisser la charge sur le mois).

### État des clés

`GET /api/keys` renvoie le nombre de clés, la stratégie, et l'état de chacune
(les clés ne sont **jamais** exposées en clair, seulement masquées) :

```json
{
  "ok": true,
  "rotation": { "enabled": true, "strategy": "failover", "keys": 3 },
  "ready": 2,
  "cooling": 1,
  "pool": [
    { "index": 0, "label": "cc_k…a1b2", "status": "ready", "cooldown_ms": 0, "reason": null },
    { "index": 1, "label": "cc_k…c3d4", "status": "cooling", "cooldown_ms": 3540000, "reason": "quota/payment required (402)" }
  ]
}
```

### Points d'attention

- L'état (clé courante + cooldowns) vit **en mémoire de l'isolate Edge** : il est partagé
  entre les invocations à chaud et remis à zéro au cold start. Les cooldowns ne sont
  qu'une optimisation — si **toutes** les clés sont en cooldown, la requête est quand même
  tentée (« fail-open »), donc le service se rétablit tout seul dès qu'un quota repart.
- Une requête n'est jamais facturée deux fois côté quota pour un même échec de clé :
  les échecs quota se produisent **avant** toute génération.
- Vous pouvez tout régler via les variables `KEY_COOLDOWN_*_MS` et `KEY_STRATEGY`
  (voir `.env.example`).

---

## Exemples

```bash
# 1) Chat — premier message
curl "https://VOTRE-PROJET.vercel.app/api/ai?prompt=bonjour&uid=123"

# 2) Chat — le contexte précédent est conservé pour le même uid
curl "https://VOTRE-PROJET.vercel.app/api/ai?prompt=Quel%20est%20mon%20pr%C3%A9nom%20%3F&uid=123"

# 3) Vision
curl "https://VOTRE-PROJET.vercel.app/api/vision?prompt=D%C3%A9crivez%20bien%20cette%20photo&image=https%3A%2F%2Fexemple.com%2Fphoto.jpg&model=claude-sonnet-5&uid=123"
```

Réponse type :

```json
{
  "ok": true,
  "uid": "123",
  "model": "claude-opus-5",
  "reply": "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
  "usage": { "prompt_tokens": 292, "completion_tokens": 341, "total_tokens": 633 },
  "turns": 1,
  "conversation_backend": "memory"
}
```

---

## Développement local

```bash
cp .env.example .env      # renseignez CODECRAFT_API_KEY
npm run dev               # http://localhost:3000
npm test                  # smoke test end-to-end (chat + vision + mémoire)
```

## Déploiement sur Vercel

```bash
npm i -g vercel
vercel                    # puis: vercel --prod
```

Puis dans **Vercel → Project → Settings → Environment Variables**, ajoutez :

| Variable | Valeur | Obligatoire |
| -------- | ------ | ----------- |
| `CODECRAFT_API_KEY` | `cc_...` (votre clé CodeCraft) | ✅ |
| `CODECRAFT_API_KEYS` | liste de clés pour la rotation, ex. `cc_a,cc_b,cc_c` | optionnel |
| `KEY_STRATEGY` | `failover` (défaut) ou `round-robin` | optionnel |
| `DEFAULT_MODEL` | `claude-opus-5` | optionnel |
| `VISION_DEFAULT_MODEL` | `claude-opus-5` | optionnel |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | pour un historique durable | optionnel |
| `API_TOKEN` | pour protéger votre API | optionnel |

> ⚠️ **La clé CodeCraft ne doit jamais être committée.** Elle vit uniquement dans les
> variables d'environnement Vercel. `.env` est dans `.gitignore`.

### Persistance de l'historique

L'API CodeCraft est *stateless* : c'est **ce projet** qui réassemble l'historique.
Deux backends dans `lib/store.mjs` :

- **mémoire** (défaut) — aucune config, mais en Edge chaque invocation peut être un isolate
  neuf : la continuité n'est alors **pas garantie** ;
- **Upstash Redis REST** — **recommandé/indispensable en production** dès que
  `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont définies (offre gratuite suffisante).

Ajustez la fenêtre avec `MAX_HISTORY_MESSAGES` (défaut 24 messages) et
`CONVERSATION_TTL_SECONDS` (défaut 86400 s = 24 h).

Sans store durable, deux solutions de continuité côté client :
- passer `history=<JSON>` à chaque appel (tableau de messages OpenAI) ;
- ou récupérer l'historique via `?return_history=1` puis le renvoyer à l'appel suivant.

---

## Structure

```
premium_rest/
├── api/                 # Edge Functions (ESM)
│   ├── ai.mjs           # GET /api/ai
│   ├── vision.mjs       # GET /api/vision
│   ├── models.mjs       # GET /api/models
│   ├── reset.mjs        # GET /api/reset
│   └── index.mjs        # GET /api (doc)
├── lib/                 # modules ESM
│   ├── ai.mjs           # logique chat/vision
│   ├── codecraft.mjs    # client upstream
│   ├── models.mjs       # catalogue (généré depuis /v1/models)
│   ├── store.mjs        # mémoire de conversation
│   └── http.mjs         # helpers Web / CORS / auth
├── test/
│   ├── dev-server.cjs   # émule les Edge Functions en local
│   └── smoke.cjs
├── vercel.json
└── .env.example
```
