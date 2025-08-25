const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { initializeDatabase } = require('./config/database');
const colors = require('colors');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

// Configuration du fuseau horaire
process.env.TZ = 'Europe/Paris';

// Création du client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
});

// Collections pour les commandes et cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();
client.aliases = new Collection();
client.pdfInputs = new Map();

// Chargement des commandes
const foldersPath = path.join(__dirname, 'commands');
if (fs.existsSync(foldersPath)) {
    const commandFolders = fs.readdirSync(foldersPath);
    
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        if (fs.statSync(commandsPath).isDirectory()) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`[COMMAND] Loaded ${command.data.name}`.green);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`.yellow);
                }
            }
        }
    }
}

// Chargement des gestionnaires
require('./handlers/events')(client);
require('./handlers/antiCrash')(client);

// Initialisation de la base de données et connexion du bot
(async () => {
    try {
        await initializeDatabase();
        await client.login(config.token);
    } catch (error) {
        console.error('Erreur lors du démarrage du bot:', error);
        process.exit(1);
    }
})();

// Export du client pour les autres modules
module.exports = client;