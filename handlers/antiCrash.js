const colors = require('colors');

module.exports = (client) => {
    // Gestion des erreurs non capturées
    process.on('unhandledRejection', (reason, promise) => {
        console.log('[ANTI-CRASH] Unhandled Rejection at:'.red, promise, 'reason:'.red, reason);
        // Log l'erreur mais ne fait pas planter le bot
    });

    process.on('uncaughtException', (err) => {
        console.log('[ANTI-CRASH] Uncaught Exception:'.red, err);
        // Log l'erreur mais ne fait pas planter le bot
    });

    process.on('uncaughtExceptionMonitor', (err, origin) => {
        console.log('[ANTI-CRASH] Uncaught Exception Monitor:'.red, err, origin);
    });

    process.on('warning', (warning) => {
        console.log('[WARNING]'.yellow, warning.name, warning.message);
    });

    // Gestion des erreurs Discord.js
    client.on('error', (error) => {
        console.log('[CLIENT ERROR]'.red, error);
    });

    client.on('warn', (warning) => {
        console.log('[CLIENT WARNING]'.yellow, warning);
    });

    client.on('debug', (info) => {
        // Optionnel: décommenter pour voir les logs de debug
        // console.log('[CLIENT DEBUG]'.blue, info);
    });

    client.on('rateLimit', (rateLimitData) => {
        console.log('[RATE LIMIT]'.magenta, rateLimitData);
    });

    client.on('disconnect', () => {
        console.log('[CLIENT] Bot disconnected'.red);
    });

    client.on('reconnecting', () => {
        console.log('[CLIENT] Bot reconnecting...'.yellow);
    });

    client.on('resume', (replayed) => {
        console.log('[CLIENT] Bot resumed'.green, `Replayed ${replayed} events`);
    });

    console.log('[ANTI-CRASH] Anti-crash handler loaded'.green);
};