// commands/list.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all active lobbies in this server'),

  async execute(interaction, client) {
    const guildId = interaction.guild.id;
    const lobbies = Array.from(client.lobbies.values()).filter(lobby => lobby.guildId === guildId);

    if (lobbies.length === 0) {
      return interaction.reply({ content: 'There are no active lobbies in this server.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Active Lobbies')
      .setDescription('List of all active lobbies in this server:')
      .setTimestamp();

    lobbies.forEach(lobby => {
      embed.addFields({
        name: `Lobby: ${lobby.lobbyId}`,
        value: `Host: <@${lobby.hostId}>
Players: ${lobby.members.length}/${lobby.maxSize}
Waitlist: ${lobby.waitlist.length}`,
        inline: false,
      });
    });

    await interaction.reply({ embeds: [embed] });
  },
};
