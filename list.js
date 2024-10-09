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
    const MAX_EMBEDS = 10;
    let embeds = [];
    let embedCount = 0;

    lobbies.forEach((lobby) => {
      const channel = interaction.guild.channels.cache.get(lobby.messageChannelId) || interaction.channel;
      const messageLink = `https://discord.com/channels/${guildId}/${channel.id}/${lobby.message.id}`;

      const gamertags = lobby.members.length > 0
        ? lobby.members.map(id => `${client.users.cache.get(id) ? `<@${id}>` : id} - ${lobby.gamertags[id] || 'N/A'}`).join('\n')
        : 'None';

      const waitlist = lobby.waitlist.length > 0
        ? lobby.waitlist.map(id => `${client.users.cache.get(id) ? `<@${id}>` : id} - ${lobby.gamertags[id] || 'N/A'}`).join('\n')
        : 'None';

      const lobbyEmbed = new EmbedBuilder()
        .setTitle(`Lobby: ${lobby.lobbyId}`)
        .setDescription(`Host: <@${lobby.hostId}>\nPlayers: ${lobby.members.length}/${lobby.maxSize}`)
        .addFields(
          { name: 'Gamertags', value: gamertags, inline: false },
          { name: 'Waitlist', value: waitlist, inline: false },
          { name: 'Lobby Link', value: `[Click here to view lobby](${messageLink})`, inline: false }
        )
        .setTimestamp()
        .setColor(0x00AE86);

      embeds.push(lobbyEmbed);
      embedCount++;

      // If we've reached the max embeds, stop adding more
      if (embedCount === MAX_EMBEDS) return;
    });

    // Prepare the reply content
    let replyContent = `**Active Lobbies (${embedCount}/${lobbies.length}):**\n`;

    if (lobbies.length > MAX_EMBEDS) {
      replyContent += `Only the first ${MAX_EMBEDS} lobbies are displayed. There are ${lobbies.length - MAX_EMBEDS} more lobbies.`;
    }

    // Send the embeds as an ephemeral message
    await interaction.reply({ 
      content: replyContent, 
      embeds: embeds, 
      ephemeral: true 
    }); 
    
    if (lobbies.length > MAX_EMBEDS) {
      await interaction.followUp({ 
        content: `There are ${lobbies.length - MAX_EMBEDS} additional lobbies not displayed here. Please narrow down your search or implement pagination for a complete list.`,
        ephemeral: true 
      });
    }
  },
};
