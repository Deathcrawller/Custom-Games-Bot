// commands/lobbysize.js

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lobbysize')
    .setDescription('Change the maximum size of a lobby')
    .addStringOption(option =>
      option.setName('lobbyname')
        .setDescription('Name of the lobby to modify')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('newsize')
        .setDescription('New maximum number of players')
        .setMinValue(2)
        .setMaxValue(24)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const lobbyName = interaction.options.getString('lobbyname').trim();
    const newSize = interaction.options.getInteger('newsize');
    const guildId = interaction.guild.id;

    // Find the lobby by name and guild
    const lobby = Array.from(client.lobbies.values()).find(
      l => l.lobbyId.toLowerCase() === lobbyName.toLowerCase() && l.guildId === guildId
    );

    if (!lobby) {
      return interaction.reply({ content: `No lobby named **${lobbyName}** found in this server.`, ephemeral: true });
    }

// Check if the user is the host or has the Custom Games Manager role
const guildMember = await interaction.guild.members.fetch(interaction.user.id);
const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');

if (interaction.user.id !== lobby.hostId && !hasRole) {
  return interaction.reply({ content: 'You do not have permission to end this lobby.', ephemeral: true });
}
    // Validate the new size against current number of players
    if (newSize < lobby.members.length) {
      return interaction.reply({
        content: `The new maximum size **(${newSize})** cannot be less than the current number of players **(${lobby.members.length})**.`,
        ephemeral: true,
      });
    }

    // Update the lobby's max size
    lobby.maxSize = newSize;

    // Update the lobby's embed message
    const channel = interaction.guild.channels.cache.get(lobby.channelId) || interaction.channel;
    const lobbyMessage = await channel.messages.fetch(lobby.message).catch(() => null);

    if (lobbyMessage) {
      const embed = lobbyMessage.embeds[0];
      if (embed) {
        const updatedEmbed = EmbedBuilder.from(embed)
          .spliceFields(1, 1, { name: 'Players', value: `${lobby.members.length}/${lobby.maxSize}`, inline: true });

        await lobbyMessage.edit({ embeds: [updatedEmbed] });
      }
    }

    // Acknowledge the size change
    await interaction.reply({ content: `The maximum size for lobby **${lobby.lobbyId}** has been updated to **${newSize}** players.`, ephemeral: true });
  },
};
