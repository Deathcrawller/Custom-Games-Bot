// commands/endlobby.js

const { SlashCommandBuilder } = require('discord.js');
const { updateLobbyEmbed } = require('../utils/lobbyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endlobby')
    .setDescription('End the current lobby')
    .addStringOption(option =>
      option.setName('lobbyname').setDescription('Name of the lobby').setRequired(true)
    ),

  async execute(interaction, client) {
    const lobbyName = interaction.options.getString('lobbyname').trim();
    const guildId = interaction.guild.id;

    const lobby = client.lobbies.get(lobbyName); // Using lobbyName directly

    if (!lobby || lobby.guildId !== guildId) {
      return interaction.reply({ content: 'There is no active lobby with this name in this server.', ephemeral: true });
    }

    // Check if the user is the host or has the Custom Games Manager role
    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');

    if (interaction.user.id !== lobby.hostId && !hasRole) {
      return interaction.reply({ content: 'You do not have permission to end this lobby.', ephemeral: true });
    }

    // Delete the lobby embed message
    if (lobby.message) {
      lobby.message.delete().catch(console.error);
    }

    // Remove the lobby from the client object
    client.lobbies.delete(lobbyName);

    await interaction.reply({ content: `The lobby **${lobbyName}** has been ended.`, ephemeral: false });
  },
};
