// index.js

const { Client, GatewayIntentBits, Partials, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import lobby utilities
const {
  handleLobbyJoin,
  handleLobbyLeave,
  handleKickInitiation,
  handleLobbyKick,
  updateLobbyEmbed,
  handleLobbyTimeout,
  removeUserFromLobby,
} = require('./utils/lobbyUtils');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

// Initialize collections
client.commands = new Collection();
client.lobbies = new Map();
client.userLobbies = new Map(); // Initialize the reverse lookup map

// Load command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`Loaded command: ${command.data.name}`);
  } else {
    console.log(`[WARNING] The command at ./commands/${file} is missing a required "data" or "execute" property.`);
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      await command.execute(interaction, client);
    } else if (interaction.isModalSubmit()) {
      // Handle modal submissions
      const modalCustomId = interaction.customId;

      // Check if the modal is for gamertag collection
      if (modalCustomId.startsWith('gamertag_modal_')) {
        const lobbyName = modalCustomId.replace('gamertag_modal_', '');
        const gamertag = interaction.fields.getTextInputValue('gamertag_input').trim();

        // Validate gamertag
        if (!gamertag) {
          return interaction.reply({ content: 'Gamertag cannot be empty.', ephemeral: true });
        }

        // Proceed to add the user to the lobby
        const lobby = client.lobbies.get(lobbyName);

        if (!lobby) {
          return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
        }

        const userId = interaction.user.id;

        // Double-check if the user is already in the lobby
        if (lobby.members.includes(userId) || lobby.waitlist.includes(userId)) {
          return interaction.reply({ content: 'You have already joined this lobby.', ephemeral: true });
        }

        // Determine if the user should be added to members or waitlist
        if (lobby.members.length < lobby.maxSize) {
          lobby.members.push(userId);
          lobby.gamertags[userId] = gamertag; // Store the provided gamertag
          client.userLobbies.set(userId, lobbyName); // Update reverse lookup
          await interaction.reply({ content: 'You have successfully joined the lobby!', ephemeral: true });
        } else {
          lobby.waitlist.push(userId);
          lobby.gamertags[userId] = gamertag; // Store the provided gamertag
          client.userLobbies.set(userId, lobbyName); // Update reverse lookup
          await interaction.reply({ content: 'Lobby is full. You have been added to the waitlist.', ephemeral: true });
        }

        // Update the lobby's embed
        updateLobbyEmbed(lobby, client);
      }
    } else if (interaction.isButton()) {
      // Handle button interactions
      const customId = interaction.customId;

      if (customId.startsWith('join_lobby_')) {
        const lobbyName = customId.replace('join_lobby_', '');
        await handleLobbyJoin(interaction, lobbyName, client);
      } else if (customId.startsWith('leave_lobby_')) {
        const lobbyName = customId.replace('leave_lobby_', '');
        await handleLobbyLeave(interaction, lobbyName, client);
      } else if (customId.startsWith('kick_lobby_')) {
        const lobbyName = customId.replace('kick_lobby_', '');
        await handleKickInitiation(interaction, lobbyName, client);
      }
      // Add more button handlers as needed
    } else if (interaction.isStringSelectMenu()) {
      // Handle select menu interactions, e.g., kicking users
      const customId = interaction.customId;

      if (customId.startsWith('kick_select_')) {
        const lobbyName = customId.replace('kick_select_', '');
        await handleLobbyKick(interaction, lobbyName, client);
      }
    
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'There was an error while processing your request.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while processing your request.', ephemeral: true });
    }
  }
  
});

// Login the bot
client.login(process.env.DISCORD_TOKEN);
