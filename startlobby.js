// commands/startlobby.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { updateLobbyEmbed, handleLobbyTimeout } = require('../utils/lobbyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startlobby')
    .setDescription('Create a new lobby')
    .addStringOption(option =>
      option.setName('lobbyname').setDescription('Name of the lobby').setRequired(true)
    ),

  async execute(interaction, client) {
    const lobbyName = interaction.options.getString('lobbyname').trim();
    const guildId = interaction.guild.id;


    // Ensure lobby name is unique within the guild
    const existingLobby = Array.from(client.lobbies.values()).find(
      lobby => lobby.lobbyId.toLowerCase() === lobbyName.toLowerCase() && lobby.guildId === guildId
    );

    if (existingLobby) {
      return interaction.reply({ content: 'A lobby with this name already exists in this server.', ephemeral: true });
    }

    const newLobby = {
      guildId,
      lobbyId: lobbyName, // Using lobbyName directly
      hostId: interaction.user.id,
      members: [],
      gamertags: {},
      waitlist: [],
      maxSize: 12, // Default max size for a lobby
      message: null,
      lastActive: Date.now(),
    };

    const embed = new EmbedBuilder()
      .setTitle(`${lobbyName}`)
      .setDescription('Lobby is active!')
      .addFields(
        { name: 'Host', value: `<@${newLobby.hostId}>`, inline: true },
        { name: 'Players', value: `0/${newLobby.maxSize}`, inline: true },
        { name: 'Gamertags', value: 'None', inline: false },
        { name: 'Waitlist', value: 'None', inline: false }
      )
      .setTimestamp();

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

    client.lobbies.set(lobbyName, newLobby);
    handleLobbyTimeout(newLobby, client);

    await interaction.reply({ content: `Lobby **${lobbyName}** has been created.`, ephemeral: true });
  },
};
