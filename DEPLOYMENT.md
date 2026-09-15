# CREPUS XD — Déploiement

## Plateformes compatibles
- Render : `npm install` puis `npm start` pour le bot, ou `npm run pairing` pour le serveur de pairing.
- Railway : `npm start` pour le bot. Le projet peut aussi lancer `npm run pairing` si le service est dédié au pairing.
- Docker / Pterodactyl : utiliser l'image construite depuis `Dockerfile` et la commande `npm start`.
- VPS / Termux / serveur Node.js : Node 20+ puis `npm install` et `npm start`.

## Pairing
Le serveur de pairing accepte le numéro fourni par l'utilisateur à `/api/pair`. Il n'y a pas de numéro WhatsApp propriétaire utilisé comme numéro par défaut pour générer un code. Le numéro saisi est transmis à Baileys via `CREPUS_PHONE`.

## Important — Vercel
Vercel n'est pas une cible adaptée au processus WhatsApp principal de ce projet : le bot nécessite un processus Node.js persistant, une session persistante et des connexions longues. Ne pas utiliser Vercel pour héberger directement le bot WhatsApp. Vercel peut servir une interface web séparée, mais le moteur WhatsApp doit rester sur un service persistant.

## Variables conservées pour compatibilité
Les variables `CREPUS_PHONE`, `CREPUS_SESSION_DIR`, `CREPUS_CHANNELS / CREPUS_CHANNELS`, `CREPUS_TG_WELCOME_IMAGE / CREPUS_TG_WELCOME_IMAGE`, `CREPUS_TG_WELCOME_AUDIO / CREPUS_TG_WELCOME_AUDIO` et `CREPUS_TG_ADMIN / CREPUS_TG_ADMIN` sont volontairement conservées : elles font partie de la configuration fonctionnelle existante et ne doivent pas être renommées simplement pour changer le nom visuel du bot.
