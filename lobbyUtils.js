// utils/lobbyUtils.js

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

/**
 * Removes a user from a specific lobby.
 * @param {string} userId - The ID of the user to remove.
 * @param {Object} lobby - The lobby object from which to remove the user.
 * @param {Client} client - The Discord client instance.
 * @returns {Promise<void>}
 */
async function removeUserFromLobby(userId, lobby, client) {
  let wasMember = false;

  // Remove from members
  if (lobby.members.includes(userId)) {
    lobby.members = lobby.members.filter(id => id !== userId);
    wasMember = true;
    console.log(`Removed user ${userId} from members of lobby ${lobby.lobbyId}`);
  }

  // Remove from waitlist
  if (lobby.waitlist.includes(userId)) {
    lobby.waitlist = lobby.waitlist.filter(id => id !== userId);
    wasMember = true;
    console.log(`Removed user ${userId} from waitlist of lobby ${lobby.lobbyId}`);
  }

  if (!wasMember) {
    console.log(`User ${userId} was not part of lobby ${lobby.lobbyId}`);
    return;
  }

  // Remove gamertag
  delete lobby.gamertags[userId];

  // Remove from reverse lookup map
  client.userLobbies.delete(userId);

  // Update the lobby embed
  updateLobbyEmbed(lobby, client);

  // Optionally, notify the user via DM
  try {
    const user = await client.users.fetch(userId);
    await user.send(`You have been removed from the lobby **${lobby.lobbyId}** in **${client.guilds.cache.get(lobby.guildId).name}** because you joined a different lobby.`);
  } catch (err) {
    console.error(`Could not send DM to user ${userId}:`, err);
  }
}

/**
 * Handles a user joining a lobby by showing a modal to collect gamertag.
 * @param {Interaction} interaction - The interaction object.
 * @param {string} lobbyName - The name of the lobby to join.
 * @param {Client} client - The Discord client instance.
 */
async function handleLobbyJoin(interaction, lobbyName, client) {
  const targetLobby = client.lobbies.get(lobbyName);

  if (!targetLobby) {
    return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
  }

  const userId = interaction.user.id;

  // Check if the user is already in any other lobbies using the reverse lookup map
  const existingLobbyName = client.userLobbies.get(userId);
  if (existingLobbyName && existingLobbyName !== lobbyName) {
    const existingLobby = client.lobbies.get(existingLobbyName);
    if (existingLobby) {
      await removeUserFromLobby(userId, existingLobby, client);
    }
  }

  // Check if the user is already in the target lobby
  if (targetLobby.members.includes(userId) || targetLobby.waitlist.includes(userId)) {
    return interaction.reply({ content: 'You have already joined this lobby.', ephemeral: true });
  }

  // Create a modal to collect the gamertag
  const modal = new ModalBuilder()
    .setCustomId(`gamertag_modal_${lobbyName}`)
    .setTitle('Enter Your Gamertag');

  // Create a text input for the gamertag
  const gamertagInput = new TextInputBuilder()
    .setCustomId('gamertag_input')
    .setLabel("What's your gamertag?")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter your gamertag here')
    .setRequired(true)
    .setMaxLength(32);

  // Add the text input to an action row
  const firstActionRow = new ActionRowBuilder().addComponents(gamertagInput);

  // Add action rows to the modal
  modal.addComponents(firstActionRow);

  // Show the modal to the user
  await interaction.showModal(modal);
}

/**
 * Handles a user leaving a lobby.
 * @param {Interaction} interaction - The interaction object.
 * @param {string} lobbyName - The name of the lobby to leave.
 * @param {Client} client - The Discord client instance.
 */
async function handleLobbyLeave(interaction, lobbyName, client) {
  const lobby = client.lobbies.get(lobbyName);

  if (!lobby) {
    return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
  }

  const userId = interaction.user.id;

  if (lobby.members.includes(userId)) {
    lobby.members = lobby.members.filter(id => id !== userId);
    client.userLobbies.delete(userId); // Update reverse lookup
  } else if (lobby.waitlist.includes(userId)) {
    lobby.waitlist = lobby.waitlist.filter(id => id !== userId);
    client.userLobbies.delete(userId); // Update reverse lookup
  } else {
    return interaction.reply({ content: 'You are not part of this lobby.', ephemeral: true });
  }

  delete lobby.gamertags[userId];
  updateLobbyEmbed(lobby, client);
  await interaction.reply({ content: 'You have left the lobby.', ephemeral: true });
}

/**
 * Handles the initiation of the kick process.
 * @param {Interaction} interaction - The interaction object.
 * @param {string} lobbyName - The name of the lobby.
 * @param {Client} client - The Discord client instance.
 */
async function handleKickInitiation(interaction, lobbyName, client) {
  const lobby = client.lobbies.get(lobbyName);

  if (!lobby) {
    return interaction.reply({ content: 'Lobby not found.', ephemeral: true });
  }

  // Check if the user is the host or has the Custom Games Manager role
  const guildMember = await interaction.guild.members.fetch(interaction.user.id);
  const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');

  if (interaction.user.id !== lobby.hostId && !hasRole) {
    return interaction.reply({ content: 'You do not have permission to end this lobby.', ephemeral: true });
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

/**
 * Handles the actual kicking of a user from the lobby.
 * @param {Interaction} interaction - The interaction object.
 * @param {string} lobbyName - The name of the lobby.
 * @param {Client} client - The Discord client instance.
 */
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
    client.userLobbies.delete(targetUserId); // Update reverse lookup
  }

  if (lobby.waitlist.includes(targetUserId)) {
    lobby.waitlist = lobby.waitlist.filter(id => id !== targetUserId);
    removed = true;
    client.userLobbies.delete(targetUserId); // Update reverse lookup
  }

  if (!removed) {
    return interaction.followUp({ content: 'The specified user is not in the lobby or waitlist.', ephemeral: true });
  }

  // Remove gamertag
  delete lobby.gamertags[targetUserId];

  // Update the lobby embed
  updateLobbyEmbed(lobby, client);

  // Notify the kicked user via DM
  if (targetUser) {
    await targetUser.send(`You have been kicked from the lobby **${lobbyName}** in **${interaction.guild.name}**.`)
      .catch(() => {
        // If the user has DMs disabled, you might want to notify in the channel or skip
      });
  }

  await interaction.followUp({ content: `<@${targetUserId}> has been kicked from the lobby.`, ephemeral: false });
}

/**
 * Updates the lobby's embed message to reflect current members and waitlist.
 * @param {Object} lobby - The lobby object.
 * @param {Client} client - The Discord client instance.
 */
function updateLobbyEmbed(lobby, client) {
  const memberGamertags = lobby.members.map(id => lobby.gamertags[id]).join('\n') || 'None';
  const waitlistGamertags = lobby.waitlist.map(id => lobby.gamertags[id]).join('\n') || 'None';

  const embed = new EmbedBuilder()
    .setTitle(`${lobby.lobbyId}`)
    .setDescription('Lobby is active!')
    .addFields(
      { name: 'Host', value: `<@${lobby.hostId}>`, inline: true },
      { name: 'Players', value: `${lobby.members.length}/${lobby.maxSize}`, inline: true },
      { name: 'Gamertags', value: lobby.members.length > 0 ? lobby.members.map(id => `${client.users.cache.get(id) ? `<@${id}>` : id} - ${lobby.gamertags[id]}`).join('\n') : 'None', inline: false },
      { name: 'Waitlist', value: lobby.waitlist.length > 0 ? lobby.waitlist.map(id => `${client.users.cache.get(id) ? `<@${id}>` : id} - ${lobby.gamertags[id]}`).join('\n') : 'None', inline: false }
    )
    .setTimestamp()
    .setColor(0x00AE86);

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

  const actionRow = new ActionRowBuilder().addComponents(joinButton, leaveButton, kickButton);

  lobby.message.edit({ embeds: [embed], components: [actionRow] }).catch(console.error);
}

/**
 * Handles lobby timeout after a period of inactivity.
 * @param {Object} lobby - The lobby object.
 * @param {Client} client - The Discord client instance.
 */
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
  removeUserFromLobby, // Export the new function
};
