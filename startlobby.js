// commands/startlobby.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { updateLobbyEmbed, handleLobbyTimeout } = require('../utils/lobbyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startlobby')
    .setDescription('Create a new lobby')
    .addStringOption(option =>
      option.setName('lobbyname')
        .setDescription('Name of the lobby')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('maxsize')
        .setDescription('Maximum number of players in the lobby')
        .setMinValue(2) // Minimum lobby size
        .setMaxValue(24) // Maximum lobby size
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const lobbyName = interaction.options.getString('lobbyname').trim();
    const maxSize = interaction.options.getInteger('maxsize') || 16; // Default to 16 if not specified
    const guildId = interaction.guild.id;

    // Check if the user has the "Custom Games Manager" role
    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');
    if (!hasRole) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    // Ensure lobby name is unique within the guild
    const existingLobby = Array.from(client.lobbies.values()).find(
      lobby => lobby.lobbyId.toLowerCase() === lobbyName.toLowerCase() && lobby.guildId === guildId
    );

    if (existingLobby) {
      return interaction.reply({ content: 'A lobby with this name already exists in this server.', ephemeral: true });
    }

    // Create a new lobby object
    const newLobby = {
      guildId,
      lobbyId: lobbyName, // Using lobbyName directly
      hostId: interaction.user.id,
      members: [interaction.user.id], // Initialize with host's ID
      gamertags: {},
      waitlist: [],
      maxSize, // Set max size from the command option
      message: null,
      lastActive: Date.now(),
    };

    // Create the lobby embed
    const embed = new EmbedBuilder()
      .setTitle(`${lobbyName}`)
      .setDescription('Lobby is active!')
      .addFields(
        { name: 'Host', value: `<@${newLobby.hostId}>`, inline: true },
        { name: 'Players', value: `1/${newLobby.maxSize}`, inline: true },
        { name: 'Gamertags', value: 'None', inline: false },
        { name: 'Waitlist', value: 'None', inline: false }
      )
      .setTimestamp()
      .setColor(0x00AE86);
    const joinButton = new ButtonBuilder()
      .setCustomId(`join_lobby_${lobbyName}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Primary);

    const leaveButton = new ButtonBuilder()
      .setCustomId(`leave_lobby_${lobbyName}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary);

    const kickButton = new ButtonBuilder()
      .setCustomId(`kick_lobby_${lobbyName}`)
      .setLabel('Kick')
      .setStyle(ButtonStyle.Danger);
      // Always enabled; permissions handled in handler

    const actionRow = new ActionRowBuilder().addComponents(joinButton, leaveButton, kickButton);

    const lobbyMessage = await interaction.channel.send({ embeds: [embed], components: [actionRow] });
    newLobby.message = lobbyMessage;
    newLobby.messageChannelId = interaction.channel.id;

    client.lobbies.set(lobbyName, newLobby);
    handleLobbyTimeout(newLobby, client);

    await interaction.reply({ content: `Lobby **${lobbyName}** has been created.`, ephemeral: true });
  },
};
