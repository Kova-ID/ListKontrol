# ☁️ Guide de déploiement ListKontrol sur Scaleway

## Vue d'ensemble

```
┌─────────────┐     HTTPS/JSON      ┌──────────────────────┐
│  ListK App  │ ◄──────────────────► │  Serverless Function │
│ (navigateur)│                      │  (API REST Node.js)  │
└─────────────┘                      └──────┬───────┬───────┘
                                            │       │
                                     ┌──────┘       └──────┐
                                     ▼                     ▼
                              ┌─────────────┐    ┌──────────────┐
                              │ Serverless  │    │   Object     │
                              │ SQL Database│    │   Storage    │
                              │ (PostgreSQL)│    │   (photos)   │
                              └─────────────┘    └──────────────┘
                                    Varsovie, Pologne (UE)
```

---

## Étape 1 — Créer un compte Scaleway

1. Aller sur https://console.scaleway.com/register
2. S'inscrire avec email
3. Ajouter une carte bancaire (aucun prélèvement si free tier)
4. Vérifier l'email

---

## Étape 2 — Créer la base de données

1. Dans la console Scaleway, aller dans :
   **Serverless > SQL Databases**

2. Cliquer **Create a database**
   - Nom : `listk-db`
   - Région : **Warsaw (pl-waw)**
   - Les paramètres par défaut suffisent

3. Une fois créée, noter le **Connection string** affiché :
   ```
   postgresql://user:password@xxxxxxxx.pg.sdb.pl-waw.scw.cloud:5432/database
   ```
   ⚠️ Gardez cette URL secrète !

4. Ouvrir l'onglet **SQL Editor** dans la console Scaleway
   et coller le contenu de `backend/schema.sql` puis exécuter.
   Vous devriez voir : "ListKontrol database ready ✅"

---

## Étape 3 — Créer le bucket Object Storage (photos)

1. Aller dans **Object Storage > Buckets**

2. Cliquer **Create a bucket**
   - Nom : `listk-photos`
   - Région : **Warsaw (pl-waw)**
   - Visibilité : **Public** (les photos doivent être accessibles par URL)

3. Noter le nom du bucket : `listk-photos`

---

## Étape 4 — Générer les clés API

1. Aller dans **Identity & Access Management > API Keys**

2. Cliquer **Generate an API Key**
   - Description : `listk-api`
   - Expiration : jamais (ou une date lointaine)

3. **NOTER IMMÉDIATEMENT** (affiché une seule fois) :
   - **Access Key** : `SCWxxxxxxxxx`
   - **Secret Key** : `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

4. Aussi, générer un **mot de passe API pour ListK** :
   Inventez une chaîne aléatoire, par exemple :
   ```
   listk-2026-votre-phrase-secrete-ici
   ```
   Ce sera le token d'authentification de l'app.

---

## Étape 5 — Déployer la Serverless Function

### Option A : Via la console web (plus simple)

1. Aller dans **Serverless > Functions**

2. Créer un **Namespace** :
   - Nom : `listk`
   - Région : **Warsaw (pl-waw)**

3. Créer une **Function** dans ce namespace :
   - Nom : `listk-api`
   - Runtime : **Node.js 20**
   - Handler : `handler.handle`
   - Mémoire : **256 Mo** (suffisant)
   - Min scale : **0** (scale to zero)
   - Max scale : **2**

4. **Variables d'environnement** (onglet Settings > Environment variables) :

   | Variable | Valeur |
   |----------|--------|
   | `API_KEY` | `listk-2026-votre-phrase-secrete-ici` |
   | `DATABASE_URL` | `postgresql://user:pass@xxx.pg.sdb.pl-waw.scw.cloud:5432/db` |
   | `S3_ENDPOINT` | `s3.pl-waw.scw.cloud` |
   | `S3_BUCKET` | `listk-photos` |
   | `S3_ACCESS_KEY` | `SCWxxxxxxxxx` |
   | `S3_SECRET_KEY` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
   | `S3_REGION` | `pl-waw` |

   ⚠️ Utilisez "secret" pour DATABASE_URL, S3_SECRET_KEY et API_KEY

5. **Uploader le code** :
   - Zipper le dossier `backend/` (handler.js + package.json)
   - Uploader le zip dans la console

6. Cliquer **Deploy**

7. Après déploiement, noter l'**URL de la fonction** :
   ```
   https://listk-api-xxxxxxxxxx.functions.fnc.pl-waw.scw.cloud
   ```

### Option B : Via CLI Scaleway (pour les devs)

```bash
# Installer le CLI Scaleway
curl -s https://raw.githubusercontent.com/scaleway/scaleway-cli/master/scripts/get.sh | sh
scw init

# Créer le namespace
scw function namespace create name=listk region=pl-waw

# Déployer
cd backend/
npm install
zip -r function.zip .
scw function function create \
  namespace-id=NAMESPACE_ID \
  name=listk-api \
  runtime=node20 \
  handler=handler.handle \
  memory-limit=256

scw function function deploy FUNCTION_ID \
  --zip-file function.zip
```

---

## Étape 6 — Tester l'API

Testez depuis votre navigateur ou avec curl :

```bash
# Test ping (pas besoin d'auth)
curl https://VOTRE-URL.functions.fnc.pl-waw.scw.cloud/ping

# Réponse attendue :
# {"status":"ok","version":"0.7.0","region":"pl-waw"}

# Test avec auth
curl -H "Authorization: Bearer listk-2026-votre-phrase-secrete" \
     https://VOTRE-URL.functions.fnc.pl-waw.scw.cloud/projects

# Réponse attendue :
# [] (liste vide, pas encore de projets)
```

---

## Étape 7 — Configurer ListK

1. Ouvrir ListK dans votre navigateur
2. Cliquer ⚙️ à côté de "☁️ Hors ligne"
3. Remplir :
   - **URL de l'API** : `https://listk-api-xxx.functions.fnc.pl-waw.scw.cloud`
   - **Clé API** : `listk-2026-votre-phrase-secrete-ici`
   - ✅ **Activer la synchronisation cloud**
4. Cliquer **Enregistrer**

Le statut devrait passer de "☁️ Hors ligne" à "✅ Synchronisé"

---

## Coûts estimés

| Service | Usage ListK | Coût mensuel |
|---------|-------------|-------------|
| Serverless SQL | ~10 Mo | ~0,10€ |
| Serverless Function | ~500 appels/jour | Gratuit (free tier) |
| Object Storage | ~1 Go photos | Gratuit (75 Go inclus) |
| **Total** | | **~0,10€/mois** |

---

## Dépannage

**"Unauthorized" (401)** :
→ Vérifier que la clé API dans ListK correspond à la variable API_KEY de la function

**"Connection refused"** :
→ Vérifier DATABASE_URL dans les variables d'environnement
→ La DB est-elle bien en région pl-waw ?

**Photos ne s'affichent pas** :
→ Vérifier que le bucket est en mode Public
→ Vérifier S3_ACCESS_KEY et S3_SECRET_KEY

**L'app marche mais pas le cloud** :
→ C'est normal ! ListK fonctionne d'abord en local, le cloud est un bonus.
→ Vos données locales sont toujours là.
