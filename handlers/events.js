const fs = require('fs');
const colors = require('colors');

module.exports = async (client) => {
    try {
        console.log("\n");
        const stringlength = 69;
        console.log(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`.bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + `MenMuse Bot - Events Handler`.bold.brightGreen + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - `MenMuse Bot - Events Handler`.length)) + "┃".bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + ` Version 2.0.0 `.bold.brightGreen + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - ` Version 2.0.0 `.length)) + "┃".bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + `Loading Events...`.bold.brightGreen + " ".repeat(Math.max(0, stringlength - `┃ `.length - `Loading Events...`.length)) + "┃".bold.brightGreen);
        console.log(`     ┃ `.bold.brightGreen + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.brightGreen);
        console.log(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`.bold.brightGreen);

        let amount = 0;
        const allevents = [];

        const load_dir = (dir) => {
            const eventsPath = `./events/${dir}`;
            if (!fs.existsSync(eventsPath)) {
                console.log(`[WARNING] Events directory ${eventsPath} does not exist`.yellow);
                return;
            }

            const event_files = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));
            
            for (const file of event_files) {
                try {
                    const event = require(`../events/${dir}/${file}`);
                    let eventName = file.split(".")[0];
                    
                    allevents.push(eventName);
                    
                    if (event.once) {
                        client.once(eventName, (...args) => event.execute(...args, client));
                    } else {
                        client.on(eventName, (...args) => event.execute(...args, client));
                    }
                    
                    amount++;
                    console.log(`[EVENT] Loaded ${eventName}`.cyan);
                } catch (e) {
                    console.log(`[ERROR] Error loading event ${file}: ${e.message}`.red);
                }
            }
        };

        // Charger les événements des différents dossiers
        const eventDirs = ['client', 'guild'];
        for (const dir of eventDirs) {
            load_dir(dir);
        }

        console.log(`\n[SUCCESS] ${amount} Events Loaded`.brightGreen);
        console.log("\n");
        console.log(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`.bold.yellow);
        console.log(`     ┃ `.bold.yellow + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.yellow);
        console.log(`     ┃ `.bold.yellow + `Logging in...`.bold.yellow + " ".repeat(Math.max(0, stringlength - ` ┃ `.length - `Logging in...`.length)) + "┃".bold.yellow);
        console.log(`     ┃ `.bold.yellow + " ".repeat(Math.max(0, stringlength - ` ┃ `.length)) + "┃".bold.yellow);
        console.log(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`.bold.yellow);
        
    } catch (e) {
        console.log(String(e.stack).bgRed);
    }
};