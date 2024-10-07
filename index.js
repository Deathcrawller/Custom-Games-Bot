// index.js

const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Initialize a Collection for commands
client.commands = new Collection();

// Initialize a Map for multiple lobbies
client.lobbies = new Map();

// Read command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

// Dynamically import each command file
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  console.log(`Loaded command: ${command.data.name}`);
}

// Event listener when the bot is ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Event listener for interaction creation
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'There was an error executing that command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
      }
    }
  } else if (interaction.isButton()) {
    const { handleLobbyJoin, handleLobbyLeave, handleKickInitiation } = require('./utils/lobbyUtils');

    const customId = interaction.customId;
    const [action, , ...lobbyNameParts] = customId.split('_'); // e.g., 'kick_lobby_LobbyName'
    const lobbyName = lobbyNameParts.join('_'); // Handles lobby names with underscores

    if (!lobbyName) {
      return interaction.reply({ content: 'Invalid lobby identifier.', ephemeral: true });
    }

    if (action === 'join') {
      await handleLobbyJoin(interaction, lobbyName, client);
    } else if (action === 'leave') {
      await handleLobbyLeave(interaction, lobbyName, client);
    } else if (action === 'kick') {
      await handleKickInitiation(interaction, lobbyName, client);
    } else {
      return interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }
  } else if (interaction.isStringSelectMenu()) { // Updated from isSelectMenu() to isStringSelectMenu()
    const { handleLobbyKick } = require('./utils/lobbyUtils');

    const customId = interaction.customId;
    if (customId.startsWith('kick_select_')) { // Check if customId starts with 'kick_select_'
      const lobbyName = customId.slice('kick_select_'.length); // Extract lobbyName
      if (lobbyName) {
        await handleLobbyKick(interaction, lobbyName, client);
      } else {
        await interaction.reply({ content: 'Invalid lobby identifier.', ephemeral: true });
      }
    } else {
      // **Important:** Do **not** reply to select menu interactions not meant for global handling.
      // This prevents the "Unknown select menu action." error for interactions handled by other collectors.
      // Simply ignore them or handle them elsewhere.
      return;
    }
  }
});

// Login to Discord with your bot's token
client.login(process.env.DISCORD_TOKEN);
