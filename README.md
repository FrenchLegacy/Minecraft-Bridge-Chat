<div style="text-align: center;">

<img src="./fl_logo.png" alt="French Legacy Logo" width="128"/>

<h1>Minecraft-Bridge-Chat</h1>

<p>Bridge de chat bidirectionnel entre le chat de guilde Minecraft et Discord.</p>

<p><a href="./README.en.md">English version</a></p>

</div>

<p style="text-align: center;">
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)
[![Mineflayer](https://img.shields.io/badge/mineflayer-v4-62B15B)](https://github.com/PrismarineJS/mineflayer)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
</p>

---

## Infos importantes

- **Node.js 22+** requis
- **Bot Discord** avec le *message content intent* et les slash commands
- **Compte Minecraft Microsoft** avec accès à la guilde cible
- **Permissions officier/admin** côté Minecraft pour les commandes de gestion
- Le logo utilisé en haut du README doit être présent dans `./fl_logo.png`

## Ce que fait le projet

- Relais en temps réel entre **Minecraft ↔ Discord**
- Détection automatique des événements de guilde : joins, leaves, promotions, kicks, mutes, etc.
- Commandes slash Discord pour gérer la guilde
- Intégration webhook avec avatars joueurs
- Support multi-guildes
- Communication inter-guildes
- Reconnexion automatique avec backoff exponentiel

## Documentation

- [Configuration](src/config/README.md)
- [Discord](src/discord/README.md)
- [Minecraft](src/minecraft/README.md)
- [Shared / utilitaires](src/shared/README.md)

## Installation rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/Fabien83560/Minecraft-Bridge-Chat.git
cd Minecraft-Bridge-Chat

# 2. Installer les dépendances
npm install

# 3. Configurer
cp config/settings.example.json config/settings.json
# Puis renseigner les identifiants dans config/settings.json

# 4. Lancer le bot
npm start
```

### Mode développement

```bash
npm run dev
```

### Avec Docker

```bash
docker-compose up -d
```

## Configuration rapide

Copie `config/settings.example.json` vers `config/settings.json`, puis renseigne au minimum :

- `app.token` — token du bot Discord
- `app.clientId` — ID client Discord
- `app.serverDiscordId` — ID du serveur Discord
- `guilds[]` — liste des guildes à connecter
- `account.email` — compte Microsoft Minecraft
- `server.host`, `server.port`, `server.version` — paramètres du serveur
- `channels` et `webhooks` — IDs de salons et webhooks Discord

Pour la structure complète, voir [la doc de configuration](src/config/README.md) et `config/settings.example.json`.

## Commandes Discord principales

| Commande | Description |
|---------|-------------|
| `/ping` | Latence du bot |
| `/help` | Aide et commandes disponibles |
| `/serverinfo` | Infos du serveur connecté |
| `/guild list` | Liste des membres de guilde |
| `/guild invite` | Invite un joueur |
| `/guild kick` | Exclut un joueur |
| `/guild promote` / `/guild demote` | Gère les rangs |
| `/guild mute` / `/guild unmute` | Modération |
| `/guild setrank` | Définit un rang directement |
| `/guild info` | Infos sur la guilde |
| `/guild execute` | Exécute une commande arbitraire de guilde |

## Dépannage rapide

- **Le bot ne se connecte pas à Minecraft** : vérifier le compte Microsoft, l’accès à la guilde et la configuration du serveur.
- **Les messages ne remontent pas** : vérifier les webhooks, les salons Discord et les patterns de détection.
- **Les commandes ne répondent pas** : vérifier les permissions du bot Discord et le rôle officier côté Minecraft.

## Structure du projet

```text
src/
├── main.js
├── config/
├── discord/
├── minecraft/
└── shared/
```

---

Projet maintenu par [Fabien83560](https://github.com/Fabien83560)
