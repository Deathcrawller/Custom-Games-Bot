// utils/lobbyUtils.js

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
  } = require('discord.js');
  
  async function handleLobbyJoin(interaction, lobbyName, client) {
    const lobby = client.lobbies.get(lobbyName);
  
    if (!lobby) {
      return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
    }
  
    const userId = interaction.user.id;
  
    if (lobby.members.includes(userId) || lobby.waitlist.includes(userId)) {
      return interaction.reply({ content: 'You have already joined this lobby.', ephemeral: true });
    }
  
    if (lobby.members.length < lobby.maxSize) {
      lobby.members.push(userId);
      lobby.gamertags[userId] = interaction.user.username; // Store gamertag here
    } else {
      lobby.waitlist.push(userId);
      lobby.gamertags[userId] = interaction.user.username; // Store gamertag here
    }
  
    updateLobbyEmbed(lobby, client);
    await interaction.reply({ content: 'You have joined the lobby.', ephemeral: true });
  }
  
  async function handleLobbyLeave(interaction, lobbyName, client) {
    const lobby = client.lobbies.get(lobbyName);
  
    if (!lobby) {
      return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
    }
  
    const userId = interaction.user.id;
  
    if (lobby.members.includes(userId)) {
      lobby.members = lobby.members.filter(id => id !== userId);
    } else if (lobby.waitlist.includes(userId)) {
      lobby.waitlist = lobby.waitlist.filter(id => id !== userId);
    } else {
      return interaction.reply({ content: 'You are not part of this lobby.', ephemeral: true });
    }
  
    delete lobby.gamertags[userId];
    updateLobbyEmbed(lobby, client);
    await interaction.reply({ content: 'You have left the lobby.', ephemeral: true });
  }
  
  async function handleKickInitiation(interaction, lobbyName, client) {
    const lobby = client.lobbies.get(lobbyName);
  
    if (!lobby) {
      return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
    }
  
    // Check if the user has the "Custom Games Manager" role
    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');
  
    if (!hasRole) {
      return interaction.reply({ content: 'You do not have permission to kick players from this lobby.', ephemeral: true });
    }
  
    // Ensure there are members to kick
    if (lobby.members.length === 0) {
      return interaction.reply({ content: 'There are no members to kick in this lobby.', ephemeral: true });
    }
  
    // Create options for the select menu with gamertags
    const memberOptions = lobby.members.map(userId => {
      const user = interaction.guild.members.cache.get(userId);
      const gamertag = lobby.gamertags[userId] || user.user.username;
      return {
        label: gamertag, // Display gamertag
        value: userId,    // Use user ID internally
      };
    });
  
    // Create the select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`kick_select_${lobbyName}`)
      .setPlaceholder('Select a member to kick')
      .addOptions(memberOptions)
      .setMinValues(1)
      .setMaxValues(1); // Only allow selecting one member at a time
  
    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
  
    await interaction.reply({
      content: 'Select a member to kick from the lobby:',
      components: [actionRow],
      ephemeral: true, // Only the manager can see this
    });
  }
  
  async function handleLobbyKick(interaction, lobbyName, client) {
    const lobby = client.lobbies.get(lobbyName);
  
    if (!lobby) {
      return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
    }
  
    // Defer the interaction to acknowledge it and gain more time
    await interaction.deferUpdate();
  
    const targetUserId = interaction.values[0];
    const targetUser = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  
    if (!targetUser) {
      return interaction.followUp({ content: 'User not found in the guild.', ephemeral: true });
    }
  
    // Optional: Prevent kicking the host or themselves
    if (targetUserId === lobby.hostId) {
      return interaction.followUp({ content: 'You cannot kick the host of the lobby.', ephemeral: true });
    }
  
    if (targetUserId === interaction.user.id) {
      return interaction.followUp({ content: 'You cannot kick yourself.', ephemeral: true });
    }
  
    // Remove the user from members or waitlist
    let removed = false;
  
    if (lobby.members.includes(targetUserId)) {
      lobby.members = lobby.members.filter(id => id !== targetUserId);
      removed = true;
    }
  
    if (lobby.waitlist.includes(targetUserId)) {
      lobby.waitlist = lobby.waitlist.filter(id => id !== targetUserId);
      removed = true;
    }
  
    if (!removed) {
      return interaction.followUp({ content: 'The specified user is not in the lobby or waitlist.', ephemeral: true });
    }
  
    // Remove gamertag
    delete lobby.gamertags[targetUserId];
  
    // Update the lobby embed
    updateLobbyEmbed(lobby, client);
  
    // Notify the kicked user via DM (optional)
    if (targetUser) {
      await targetUser.send(`You have been kicked from the lobby **${lobbyName}** in **${interaction.guild.name}**.`)
        .catch(() => {
          // If the user has DMs disabled, you might want to notify in the channel or skip
        });
    }
  
    await interaction.followUp({ content: `<@${targetUserId}> has been kicked from the lobby.`, ephemeral: false });
  }
  
  function updateLobbyEmbed(lobby, client) {
    const memberGamertags = lobby.members.map(id => lobby.gamertags[id]).join('\n') || 'None';
    const waitlistGamertags = lobby.waitlist.map(id => lobby.gamertags[id]).join('\n') || 'None';
  
    const embed = new EmbedBuilder()
      .setTitle(`Customs Lobby: ${lobby.lobbyId}`)
      .setDescription('Lobby is active!')
      .addFields(
        { name: 'Host', value: `<@${lobby.hostId}>`, inline: true },
        { name: 'Players', value: `${lobby.members.length}/${lobby.maxSize}`, inline: true },
        { name: 'Gamertags', value: memberGamertags, inline: false },
        { name: 'Waitlist', value: waitlistGamertags, inline: false }
      )
      .setTimestamp();
  
    const joinButton = new ButtonBuilder()
      .setCustomId(`join_lobby_${lobby.lobbyId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Primary);
  
    const leaveButton = new ButtonBuilder()
      .setCustomId(`leave_lobby_${lobby.lobbyId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary);
  
    const kickButton = new ButtonBuilder()
      .setCustomId(`kick_lobby_${lobby.lobbyId}`)
      .setLabel('Kick')
      .setStyle(ButtonStyle.Danger);
      // Removed .setDisabled(!hasRole)
  
    const actionRow = new ActionRowBuilder().addComponents(joinButton, leaveButton, kickButton);
  
    lobby.message.edit({ embeds: [embed], components: [actionRow] }).catch(console.error);
  }
  
  // Function to handle lobby timeout
  function handleLobbyTimeout(lobby, client) {
    setTimeout(() => {
      const existingLobby = client.lobbies.get(lobby.lobbyId);
      if (existingLobby && (Date.now() - existingLobby.lastActive) >= 3600000) { // 1 hour of inactivity
        if (existingLobby.message) {
          existingLobby.message.delete().catch(console.error);
        }
        client.lobbies.delete(lobby.lobbyId);
        console.log(`Lobby ${lobby.lobbyId} has been removed due to inactivity.`);
      }
    }, 3600000); // Check after 1 hour
  }
  
  module.exports = {
    handleLobbyJoin,
    handleLobbyLeave,
    handleKickInitiation,
    handleLobbyKick,
    updateLobbyEmbed,
    handleLobbyTimeout,
  };
  