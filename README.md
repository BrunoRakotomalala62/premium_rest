# premium_rest

REST API **serverless (Vercel)** au-dessus de l'API [CodeCraft](https://codecraftapi.com/docs)
(compatible OpenAI), avec :

- 💬 **conversation continue** — l'historique est conservé côté serveur par `uid` ;
- 🖼️ **vision** — analyse d'images par URL ;
- 🤖 **33 modèles récents** — Claude 5 / Opus 5, Claude Mythos, GPT‑5.6 Luna / Terra / Sol, Gemini 3.7, Grok 4.6, DeepSeek‑V4…

Aucune dépendance npm : le projet n'utilise que le `fetch` natif de Node 18+,
donc déploiement Vercel instantané.

---

## Routes

| Méthode | Route | Description |
| ------ | ----- | ----------- |
| `GET` | `/api/ai?prompt=bonjour&uid=123` | Chat avec **mémoire de conversation** par `uid` |
| `GET` | `/api/vision?prompt=décrivez bien cette photo&image=URL_IMAGE&model=...&uid=123` | Analyse d'image |
| `GET` | `/api/ai?prompt=...&image=URL_IMAGE&uid=123` | Identique à `/api/vision` (raccourci) |
| `GET` | `/api/models` | Liste des modèles (+ alias et capacités vision) |
| `GET` | `/api/reset?uid=123` | Efface la conversation d'un `uid` |
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
| `DEFAULT_MODEL` | `claude-opus-5` | optionnel |
| `VISION_DEFAULT_MODEL` | `claude-opus-5` | optionnel |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | pour un historique durable | optionnel |
| `API_TOKEN` | pour protéger votre API | optionnel |

> ⚠️ **La clé CodeCraft ne doit jamais être committée.** Elle vit uniquement dans les
> variables d'environnement Vercel. `.env` est dans `.gitignore`.

### Persistance de l'historique

L'API CodeCraft est *stateless* : c'est **ce projet** qui réassemble l'historique.
Deux backends dans `lib/store.js` :

- **mémoire** (défaut) — fonctionne sans config, mais un cold start Vercel peut perdre le contexte ;
- **Upstash Redis REST** — durable, dès que `UPSTASH_REDIS_REST_URL` et
  `UPSTASH_REDIS_REST_TOKEN` sont définies (offre gratuite suffisante).

Ajustez la fenêtre avec `MAX_HISTORY_MESSAGES` (défaut 24 messages) et
`CONVERSATION_TTL_SECONDS` (défaut 86400 s = 24 h).

---

## Structure

```
premium_rest/
├── api/
│   ├── ai.js        # GET /api/ai
│   ├── vision.js    # GET /api/vision
│   ├── models.js    # GET /api/models
│   ├── reset.js     # GET /api/reset
│   └── index.js     # GET /api (doc)
├── lib/
│   ├── ai.js        # logique chat/vision
│   ├── codecraft.js # client upstream
│   ├── models.js    # catalogue (généré depuis /v1/models)
│   ├── store.js     # mémoire de conversation
│   └── http.js      # helpers HTTP / CORS / auth
├── test/
│   ├── dev-server.cjs
│   └── smoke.cjs
├── vercel.json
└── .env.example
```
