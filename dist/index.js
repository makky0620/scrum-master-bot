"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const reminderScheduler_1 = require("./services/reminderScheduler");
const storage_1 = require("./utils/storage");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// Create a new client instance
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
// Create a collection to store commands
client.commands = new discord_js_1.Collection();
// Initialize reminder scheduler
const reminderStorage = new storage_1.ReminderStorage();
const reminderScheduler = new reminderScheduler_1.ReminderScheduler(client, reminderStorage);
// Load commands from the commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[INFO] Loaded command: ${command.data.name}`);
    }
    else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}
// When the client is ready, run this code (only once)
client.once(discord_js_1.Events.ClientReady, readyClient => {
    console.log(`[INFO] Ready! Logged in as ${readyClient.user.tag}`);
    // Start the reminder scheduler
    reminderScheduler.start();
    console.log('[INFO] Reminder scheduler started');
});
// Handle interactions
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    // Handle slash command interactions
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
            return;
        }
        try {
            await command.execute(interaction);
        }
        catch (error) {
            console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);
            const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            }
            else {
                await interaction.reply(errorMessage);
            }
        }
        return;
    }
    // Handle modal submit interactions
    if (interaction.isModalSubmit()) {
        // Extract command name from modal custom ID (format: "commandName-modal:data")
        const customId = interaction.customId;
        let commandName = '';
        // Check for reminder edit modal
        if (customId.startsWith('edit-reminder-modal:')) {
            commandName = 'reminder';
        }
        if (!commandName) {
            console.error(`[ERROR] Could not determine command for modal submission: ${customId}`);
            return;
        }
        const command = client.commands.get(commandName);
        if (!command) {
            console.error(`[ERROR] No command matching ${commandName} was found for modal submission.`);
            return;
        }
        if (!command.handleModalSubmit) {
            console.error(`[ERROR] Command ${commandName} does not support modal submissions.`);
            return;
        }
        try {
            await command.handleModalSubmit(interaction);
        }
        catch (error) {
            console.error(`[ERROR] Error handling modal submission for ${commandName}:`, error);
            const errorMessage = { content: 'There was an error while processing your submission!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            }
            else {
                await interaction.reply(errorMessage);
            }
        }
        return;
    }
});
// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('[INFO] Received SIGINT, shutting down gracefully...');
    reminderScheduler.stop();
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('[INFO] Received SIGTERM, shutting down gracefully...');
    reminderScheduler.stop();
    process.exit(0);
});
