const { Events, ActivityType } = require('discord.js');
const colors = require('colors');
const config = require('../../config');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log('\n');
        const stringlength = 69;
        console.log(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`.bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + `Bot connecté avec succès !`.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - `Bot connecté avec succès !`.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + ` Utilisateur: ${client.user.tag} `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` Utilisateur: ${client.user.tag} `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + ` ID: ${client.user.id} `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` ID: ${client.user.id} `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + ` Serveurs: ${client.guilds.cache.size} `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` Serveurs: ${client.guilds.cache.size} `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + ` Utilisateurs: ${client.users.cache.size} `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` Utilisateurs: ${client.users.cache.size} `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + ` Version: ${config.version} `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` Version: ${config.version} `.length)) + "┃".bold.brightBlue);
        console.log(`     ┃ `.bold.brightBlue + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.brightBlue);
        console.log(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`.bold.brightBlue);
        console.log('\n');

        // Définir le statut du bot
        const activities = [
            { name: 'Génération de PDF', type: ActivityType.Playing },
            { name: 'les tickets de support', type: ActivityType.Watching },
            { name: `${client.guilds.cache.size} serveurs`, type: ActivityType.Watching },
            { name: '/help pour l\'aide', type: ActivityType.Listening }
        ];

        let currentActivity = 0;
        
        const updateActivity = () => {
            client.user.setActivity(activities[currentActivity]);
            currentActivity = (currentActivity + 1) % activities.length;
        };

        // Mettre à jour l'activité immédiatement
        updateActivity();
        
        // Changer l'activité toutes les 30 secondes
        setInterval(updateActivity, 30000);

        // Enregistrer les commandes slash si nécessaire
        if (config.loadSlashsGlobal) {
            try {
                const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());
                
                if (config.guildId) {
                    // Enregistrer pour un serveur spécifique (développement)
                    const guild = client.guilds.cache.get(config.guildId);
                    if (guild) {
                        await guild.commands.set(commands);
                        console.log(`[COMMANDS] ${commands.length} commandes slash enregistrées pour le serveur ${guild.name}`.green);
                    }
                } else {
                    // Enregistrer globalement (production)
                    await client.application.commands.set(commands);
                    console.log(`[COMMANDS] ${commands.length} commandes slash enregistrées globalement`.green);
                }
            } catch (error) {
                console.error('[ERROR] Erreur lors de l\'enregistrement des commandes slash:'.red, error);
            }
        }

        console.log('[READY] Bot prêt à fonctionner !'.green);
    },
};