import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import { TetracubedAPIClient } from './api-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { status } from 'minecraft-server-util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Validate environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'API_BASE_URL', 'API_USERNAME', 'API_PASSWORD'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// Initialize API client
const apiClient = new TetracubedAPIClient(
    process.env.API_BASE_URL,
    process.env.API_USERNAME,
    process.env.API_PASSWORD
);

// Config file for runtime settings
const configPath = path.join(__dirname, '..', 'config.json');

// Load or create config
let config = {
    notificationChannelId: process.env.NOTIFICATION_CHANNEL_ID || null
};

try {
    if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = { ...config, ...fileConfig };
    }
} catch (error) {
    console.error('Error loading config file:', error.message);
}

// Save config to file
function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config file:', error.message);
    }
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Helper function to send notifications to channel
async function sendNotification(embed) {
    const channelId = config.notificationChannelId || process.env.NOTIFICATION_CHANNEL_ID;

    if (!channelId) {
        return; // Notifications disabled if channel not configured
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Failed to send notification:', error.message);
    }
}

// Define slash commands
const commands = [
    {
        name: 'start',
        description: 'Start the Tetracubed Minecraft server'
    },
    {
        name: 'stop',
        description: 'Stop the Tetracubed Minecraft server'
    },
    {
        name: 'status',
        description: 'Get the current status of the Tetracubed server'
    },
    {
        name: 'info',
        description: 'Get information about Tetracubed Fox bot'
    },
    {
        name: 'hello',
        description: 'Say hello to the bot'
    },
    {
        name: 'set-notification-channel',
        description: 'Set the channel for server notifications',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                name: 'channel',
                description: 'The channel to send notifications to',
                type: 7, // CHANNEL type
                required: true,
                channel_types: [ChannelType.GuildText]
            }
        ]
    },
    {
        name: 'ping',
        description: 'Check bot latency and response time'
    },
    {
        name: 'ping-server',
        description: 'Check if the Minecraft server is online and get server info'
    }
];

// Register commands
async function registerCommands() {
    try {
        console.log('Registering slash commands...');
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('Successfully registered slash commands');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Check if user has permission
function hasPermission(interaction) {
    // If ALLOWED_ROLE_ID is set, check if user has that role
    if (process.env.ALLOWED_ROLE_ID) {
        return interaction.member.roles.cache.has(process.env.ALLOWED_ROLE_ID);
    }

    // If ADMIN_USER_IDS is set, check if user is in the list
    if (process.env.ADMIN_USER_IDS) {
        const adminIds = process.env.ADMIN_USER_IDS.split(',');
        return adminIds.includes(interaction.user.id);
    }

    // Default: require administrator permission
    return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'start':
                await handleStart(interaction);
                break;
            case 'stop':
                await handleStop(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'info':
                await handleInfo(interaction);
                break;
            case 'hello':
                await handleHello(interaction);
                break;
            case 'set-notification-channel':
                await handleSetNotificationChannel(interaction);
                break;
            case 'ping':
                await handlePing(interaction);
                break;
            case 'ping-server':
                await handlePingServer(interaction);
                break;
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);

        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Error')
            .setDescription(error.message || 'An unexpected error occurred')
            .setTimestamp();

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
});

async function handleStart(interaction) {
    if (!hasPermission(interaction)) {
        await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply();

    const startEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⏳ Starting Tetracubed Server')
        .setDescription('Please wait while the server provisions...')
        .addFields(
            { name: 'Status', value: '🔄 Provisioning AWS infrastructure', inline: false },
            { name: 'Estimated Time', value: '10-15 minutes', inline: true },
            { name: 'Started By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'This message will update when complete' })
        .setTimestamp();

    await interaction.editReply({ embeds: [startEmbed] });

    const result = await apiClient.startServer();

    const serverAddress = process.env.SERVER_HOSTNAME || result.public_ip;

    const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Server Started Successfully!')
        .setDescription(`**The Minecraft server is now online!**\n\nConnect using: \`${serverAddress}\``)
        .addFields(
            { name: '🌐 Server Address', value: `\`${serverAddress || 'N/A'}\``, inline: true },
            { name: '👤 Started By', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏱️ Time Taken', value: '~10-15 min', inline: true },
            { name: '📋 Next Steps', value: '• Open Minecraft\n• Go to Multiplayer\n• Add Server with the address above\n• Join and play!', inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

    // Send notification to channel
    await sendNotification(successEmbed);
}

async function handleStop(interaction) {
    if (!hasPermission(interaction)) {
        await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply();

    const stopEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⏳ Stopping Tetracubed Server')
        .setDescription('Please wait while the server shuts down safely...')
        .addFields(
            { name: 'Status', value: '🔄 Saving world data and deprovisioning', inline: false },
            { name: 'Estimated Time', value: '5-10 minutes', inline: true },
            { name: 'Stopped By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'This message will update when complete' })
        .setTimestamp();

    await interaction.editReply({ embeds: [stopEmbed] });

    const result = await apiClient.stopServer();

    const successEmbed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('✅ Server Stopped Successfully')
        .setDescription('**The Minecraft server has been shut down.**\n\nWorld data has been safely saved to S3.')
        .addFields(
            { name: '💾 Status', value: 'World data backed up', inline: true },
            { name: '👤 Stopped By', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏱️ Time Taken', value: '~5-10 min', inline: true },
            { name: '🔄 Restart', value: 'Use `/start` when you want to play again', inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

    // Send notification to channel
    await sendNotification(successEmbed);
}

async function handleStatus(interaction) {
    await interaction.deferReply();

    const result = await apiClient.getResources();

    const statusEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Tetracubed Server Status')
        .setTimestamp();

    if (result.message) {
        statusEmbed.setDescription(result.message);
    } else if (result.outputs) {
        // Show server public IP prominently if available
        const serverAddress = process.env.SERVER_HOSTNAME || result.outputs.public_ip;
        if (serverAddress) {
            statusEmbed.setDescription(`**Server Address:** \`${serverAddress}\``);
        }

        statusEmbed.addFields(
            { name: 'Stack Name', value: result.stack_name || 'N/A' }
        );

        // Show important fields
        if (result.outputs.public_ip) {
            statusEmbed.addFields({
                name: 'PUBLIC IP',
                value: String(result.outputs.public_ip),
                inline: true
            });
        }

        if (result.outputs.ecs_cluster_name) {
            statusEmbed.addFields({
                name: 'ECS CLUSTER NAME',
                value: String(result.outputs.ecs_cluster_name),
                inline: true
            });
        }

        if (result.outputs.ecs_service_name) {
            statusEmbed.addFields({
                name: 'ECS SERVICE NAME',
                value: String(result.outputs.ecs_service_name),
                inline: true
            });
        }

        // Add any remaining fields
        const shownFields = ['public_ip', 'ecs_cluster_name', 'ecs_service_name'];
        for (const [key, value] of Object.entries(result.outputs)) {
            if (!shownFields.includes(key)) {
                statusEmbed.addFields({
                    name: key.replace(/_/g, ' ').toUpperCase(),
                    value: String(value),
                    inline: true
                });
            }
        }
    } else {
        statusEmbed.setDescription('No resources found');
    }

    await interaction.editReply({ embeds: [statusEmbed] });
}

async function handleInfo(interaction) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Tetracubed Fox Bot 🦊')
        .setDescription('A Discord bot for managing Tetracubed Minecraft servers')
        .addFields(
            {
                name: '🎮 Server Management',
                value: '`/start` - Start the server\n`/stop` - Stop the server\n`/set-notification-channel` - Configure notifications',
                inline: false
            },
            {
                name: '📊 Information',
                value: '`/status` - Infrastructure status\n`/ping-server` - Minecraft server status\n`/ping` - Bot latency',
                inline: false
            },
            {
                name: '🎲 Other',
                value: '`/hello` - Say hello\n`/info` - Show this help',
                inline: false
            },
            { name: 'Source', value: '[GitHub](https://github.com/tetracionist/tetracubed-fox)' }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
}

async function handleHello(interaction) {
    const greetings = [
        "Hey there! 👋 Ready to play some Minecraft?",
        "Hello! 🦊 What can I help you with today?",
        "Hi! 🎮 Need to start the server?",
        "Greetings! 👋 How's your day going?",
        "Hey! 🦊 The Tetracubed server awaits!",
        "Hello there! 🎮 Ready for some blocky adventures?"
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const helloEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('👋 Hello!')
        .setDescription(randomGreeting)
        .addFields(
            { name: 'Quick Tips', value: 'Use `/start` to launch the server\nUse `/status` to check if it\'s running\nUse `/help` for more commands' }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [helloEmbed] });
}

async function handlePing(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, ephemeral: true });

    const botLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const pingEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏓 Pong!')
        .addFields(
            { name: 'Bot Latency', value: `${botLatency}ms`, inline: true },
            { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
            { name: 'Status', value: botLatency < 200 ? '✅ Excellent' : botLatency < 500 ? '⚠️ Good' : '🔴 Slow', inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ content: null, embeds: [pingEmbed] });
}

async function handleSetNotificationChannel(interaction) {
    if (!hasPermission(interaction)) {
        await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true
        });
        return;
    }

    const channel = interaction.options.getChannel('channel');

    // Update config
    config.notificationChannelId = channel.id;
    saveConfig();

    const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Notification Channel Set')
        .setDescription(`Server notifications will now be posted to ${channel}`)
        .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Set By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [successEmbed] });

    // Send a test notification
    const testEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔔 Notifications Enabled')
        .setDescription('This channel will receive server start/stop notifications.')
        .setTimestamp();

    await sendNotification(testEmbed);
}

async function handlePingServer(interaction) {
    await interaction.deferReply();

    try {
        // First, get the server IP from the API
        const result = await apiClient.getResources();

        // Check if public_ip exists - this indicates if infrastructure is provisioned
        if (!result.outputs?.public_ip) {
            const offlineEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🔴 Server Offline')
                .setDescription('The Tetracubed server is not currently running.')
                .addFields(
                    { name: 'Status', value: 'Infrastructure not provisioned' },
                    { name: 'Tip', value: 'Use `/start` to launch the server' }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [offlineEmbed] });
            return;
        }

        // Infrastructure is up - determine address to ping
        // Use configured hostname (DDNS), or fall back to public IP
        const serverAddress = process.env.SERVER_HOSTNAME || result.outputs.public_ip;

        const serverPort = 25565; // Default Minecraft port

        // Query the Minecraft server
        const startTime = Date.now();
        const serverStatus = await status(serverAddress, serverPort, { timeout: 5000 });
        const responseTime = Date.now() - startTime;

        // Server is online
        const onlineEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🟢 Server Online')
            .setDescription(serverStatus.motd?.clean || 'Minecraft Server')
            .addFields(
                { name: 'Address', value: `\`${serverAddress}\``, inline: true },
                { name: 'Players', value: `${serverStatus.players.online}/${serverStatus.players.max}`, inline: true },
                { name: 'Response Time', value: `${responseTime}ms`, inline: true },
                { name: 'Version', value: serverStatus.version.name || 'Unknown', inline: true },
                { name: 'Protocol', value: `${serverStatus.version.protocol}`, inline: true }
            )
            .setTimestamp();

        // Add player list if available and server has players
        if (serverStatus.players.online > 0 && serverStatus.players.sample) {
            const playerNames = serverStatus.players.sample.map(p => p.name).join(', ');
            onlineEmbed.addFields({ name: 'Online Players', value: playerNames });
        }

        await interaction.editReply({ embeds: [onlineEmbed] });

    } catch (error) {
        console.error('Error pinging Minecraft server:', error);

        // Check if it's a timeout or connection error
        const isTimeout = error.message?.includes('timeout') || error.code === 'ETIMEDOUT';
        const isRefused = error.code === 'ECONNREFUSED';

        let errorMessage = 'Unable to connect to the Minecraft server.';
        let statusText = 'Server may be starting up or offline';

        if (isTimeout) {
            errorMessage = 'Connection timed out. The server may be starting up or experiencing issues.';
            statusText = 'Starting up or not responding';
        } else if (isRefused) {
            errorMessage = 'Connection refused. The Minecraft server process may not be running yet.';
            statusText = 'Server process not started';
        }

        const errorEmbed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('⚠️ Cannot Reach Server')
            .setDescription(errorMessage)
            .addFields(
                { name: 'Status', value: statusText },
                { name: 'Tip', value: 'Infrastructure may be up but Minecraft server is still loading. Try again in 1-2 minutes.' }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// Update bot status based on server state
async function updateBotStatus() {
    try {
        // Get server info from API
        const result = await apiClient.getResources();

        // Check if public_ip exists - this indicates if infrastructure is provisioned
        if (!result.outputs?.public_ip) {
            // Server is offline
            client.user.setPresence({
                activities: [{ name: '🔴 Server Offline', type: 3 }], // Type 3 = Watching
                status: 'idle'
            });
            return;
        }

        // Infrastructure is up - determine address to ping
        // Use configured hostname (DDNS), or fall back to public IP
        const serverAddress = process.env.SERVER_HOSTNAME || result.outputs.public_ip;

        try {
            // Ping the Minecraft server to get player count
            const serverStatus = await status(serverAddress, 25565, { timeout: 3000 });

            // Server is online
            const playerCount = `${serverStatus.players.online}/${serverStatus.players.max}`;
            client.user.setPresence({
                activities: [{ name: `🟢 ${playerCount} players`, type: 3 }], // Type 3 = Watching
                status: 'online'
            });
        } catch (error) {
            // Infrastructure is up but Minecraft server not responding
            client.user.setPresence({
                activities: [{ name: '🟡 Server Starting...', type: 3 }],
                status: 'dnd'
            });
        }
    } catch (error) {
        // API error - keep default status
        console.error('Error updating bot status:', error.message);
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is ready and serving ${client.guilds.cache.size} guilds`);

    // Register slash commands
    await registerCommands();

    // Set initial bot status
    await updateBotStatus();

    // Update status every 2 minutes
    setInterval(updateBotStatus, 120000); // 2 minutes in milliseconds
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
