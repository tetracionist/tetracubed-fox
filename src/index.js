import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import { TetracubedAPIClient } from './api-client.js';

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

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Helper function to send notifications to channel
async function sendNotification(embed) {
    if (!process.env.NOTIFICATION_CHANNEL_ID) {
        return; // Notifications disabled if channel not configured
    }

    try {
        const channel = await client.channels.fetch(process.env.NOTIFICATION_CHANNEL_ID);
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
        description: 'Start the Tetracubed Minecraft server',
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'stop',
        description: 'Stop the Tetracubed Minecraft server',
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'status',
        description: 'Get the current status of the Tetracubed server'
    },
    {
        name: 'info',
        description: 'Get information about Tetracubed Fox bot'
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
        .setTitle('Starting Tetracubed Server')
        .setDescription('Provisioning infrastructure and starting the Minecraft server...')
        .setTimestamp();

    await interaction.editReply({ embeds: [startEmbed] });

    const result = await apiClient.startServer();

    const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🟢 Tetracubed Server Started!')
        .setDescription('The Minecraft server is now online and ready to play.')
        .addFields(
            { name: 'Server IP', value: result.public_ip || 'N/A', inline: true },
            { name: 'Started By', value: `<@${interaction.user.id}>`, inline: true }
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
        .setTitle('Stopping Tetracubed Server')
        .setDescription('Saving world data and deprovisioning infrastructure...')
        .setTimestamp();

    await interaction.editReply({ embeds: [stopEmbed] });

    const result = await apiClient.stopServer();

    const successEmbed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('🔴 Tetracubed Server Stopped')
        .setDescription('The Minecraft server has been shut down and world data saved.')
        .addFields(
            { name: 'Stopped By', value: `<@${interaction.user.id}>`, inline: true }
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
        statusEmbed.addFields(
            { name: 'Stack Name', value: result.stack_name || 'N/A' }
        );

        for (const [key, value] of Object.entries(result.outputs)) {
            statusEmbed.addFields({
                name: key.replace(/_/g, ' ').toUpperCase(),
                value: String(value),
                inline: true
            });
        }
    } else {
        statusEmbed.setDescription('No resources found');
    }

    await interaction.editReply({ embeds: [statusEmbed] });
}

async function handleInfo(interaction) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Tetracubed Fox Bot')
        .setDescription('A Discord bot for managing Tetracubed Minecraft servers')
        .addFields(
            { name: 'Commands', value: '`/start` - Start the server\n`/stop` - Stop the server\n`/status` - Check server status\n`/info` - Show this information' },
            { name: 'Source', value: '[GitHub](https://github.com/tetracionist/tetracubed-api)' }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
}

// Bot ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is ready and serving ${client.guilds.cache.size} guilds`);

    // Register slash commands
    await registerCommands();

    // Set bot status
    client.user.setPresence({
        activities: [{ name: 'Tetracubed Minecraft', type: 0 }],
        status: 'online'
    });
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
