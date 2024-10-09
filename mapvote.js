// commands/mapvote.js

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Define valid lobby sizes and gamemodes
const validLobbySizes = [
  { label: 'Small 2-8', value: 'small' },
  { label: 'Medium 9-16', value: 'medium' },
  { label: 'Large 17-24', value: 'large' },
  { label: 'Any 2-24', value: 'any' },
];

const validGamemodes = [
  { label: 'Minigame', value: 'minigame' },
  { label: 'Standard', value: 'standard' },
  { label: 'Infection', value: 'infection' },
  { label: 'Vehicle', value: 'vehicle' },
  { label: 'Other', value: 'other' },
];

// Helper functions

/**
 * Retrieves map options based on selected lobby sizes and gamemodes.
 * @param {Array} selectedLobbySizes - Selected lobby size values.
 * @param {Array} selectedGamemodes - Selected gamemode values.
 * @returns {Array} - Filtered map options.
 */
function getMapOptions(selectedLobbySizes, selectedGamemodes) {
  const dataPath = path.join(__dirname, '../mapDatabase.json');
  let allMaps;
  try {
    allMaps = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    console.error('Error reading mapDatabase.json:', err);
    return [];
  }

  // Filter the maps based on selected criteria
  const filteredMaps = allMaps.filter(map => {
    const mapGameType = map['Game Type']?.toLowerCase().trim();
    const mapLobbySize = map['Lobby Size']?.toLowerCase().trim();

    if (!mapGameType || !mapLobbySize) {
      return false; // Skip this map if properties are missing
    }

    // Match gamemodes and lobby sizes by checking for partial matches
    const matchesGameMode = selectedGamemodes.some(gm => mapGameType.includes(gm));
    const matchesLobbySize = selectedLobbySizes.some(ls => mapLobbySize.includes(ls));

    return matchesGameMode && matchesLobbySize;
  });

  return filteredMaps;
}

/**
 * Selects a specified number of random maps from the provided array.
 * @param {Array} maps - Array of map objects.
 * @param {number} count - Number of maps to select.
 * @returns {Array} - Array of selected map objects.
 */
function selectRandomMaps(maps, count) {
  const shuffled = shuffleArray([...maps]);
  return shuffled.slice(0, count);
}

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {Array} array - The array to shuffle.
 * @returns {Array} - Shuffled array.
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mapvote')
    .setDescription('Initiate a map vote'),

  async execute(interaction, client) {
    try {
      // Fetch all lobbies hosted by the user
      const hostedLobbies = Array.from(client.lobbies.values()).filter(
        lobby => lobby.hostId === interaction.user.id
      );

      if (hostedLobbies.length === 0) {
        return interaction.reply({ content: 'You are not hosting any active lobbies.', ephemeral: true });
      }

      // Create options for the lobby selection menu
      const lobbyOptions = hostedLobbies.map(lobby => ({
        label: lobby.lobbyId, // Lobby Name
        description: `Players: ${lobby.members.length}/${lobby.maxSize}`,
        value: lobby.lobbyId, // Unique identifier
      }));

      // Create the lobby selection menu
      const lobbySelectMenu = new StringSelectMenuBuilder()
        .setCustomId('mapvote_select_lobby')
        .setPlaceholder('Select a lobby to initiate a map vote')
        .addOptions(lobbyOptions);

      const lobbyActionRow = new ActionRowBuilder().addComponents(lobbySelectMenu);

      // Create an embed for the lobby selection prompt
      const lobbySelectionEmbed = new EmbedBuilder()
        .setTitle('Initiate Map Vote')
        .setDescription('Please select the lobby you want to initiate a map vote for.')
        .setColor(0x00AE86)
        .setTimestamp();

      // Send the lobby selection prompt
      await interaction.reply({ embeds: [lobbySelectionEmbed], components: [lobbyActionRow], ephemeral: true });

      // Create a collector to handle the lobby selection
      const filter = i => i.customId === 'mapvote_select_lobby' && i.user.id === interaction.user.id;

      const collector = interaction.channel.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000, max: 1 });

      collector.on('collect', async i => {
        const selectedLobbyId = i.values[0];
        const selectedLobby = client.lobbies.get(selectedLobbyId);

        if (!selectedLobby) {
          return i.update({ content: 'Selected lobby not found or has been closed.', embeds: [], components: [] });
        }

        // Proceed to select lobby size and gamemode
        await initiateLobbySettingsSelection(i, client, selectedLobby);
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({ content: 'Map vote initiation timed out. Please try again.', embeds: [], components: [] });
        }
      });
    } catch (error) {
      console.error('Error executing command /mapvote:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'There was an error executing the map vote command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing the map vote command.', ephemeral: true });
      }
    }
  },
};

/**
 * Handles the lobby size and gamemode selection for a specific lobby.
 * @param {Interaction} interaction - The interaction object from the lobby selection.
 * @param {Client} client - The Discord client instance.
 * @param {Object} lobby - The selected lobby object.
 */
async function initiateLobbySettingsSelection(interaction, client, lobby) {
  try {
    // Create selection menus for lobby size and gamemode
    const lobbySizeMenu = new StringSelectMenuBuilder()
      .setCustomId(`mapvote_select_lobbysize_${lobby.lobbyId}`)
      .setPlaceholder('Select Lobby Sizes')
      .setMinValues(1)
      .setMaxValues(validLobbySizes.length)
      .addOptions(validLobbySizes);

    const gamemodeMenu = new StringSelectMenuBuilder()
      .setCustomId(`mapvote_select_gamemode_${lobby.lobbyId}`)
      .setPlaceholder('Select Gamemodes')
      .setMinValues(1)
      .setMaxValues(validGamemodes.length)
      .addOptions(validGamemodes);

    // Action rows to hold the menus
    const sizeActionRow = new ActionRowBuilder().addComponents(lobbySizeMenu);
    const gamemodeActionRow = new ActionRowBuilder().addComponents(gamemodeMenu);

    // Create an embed for the settings selection prompt
    const settingsSelectionEmbed = new EmbedBuilder()
      .setTitle(`Map Vote Settings for Lobby: ${lobby.lobbyId}`)
      .setDescription('Please select the desired lobby size and gamemode for the map vote.')
      .setColor(0x00AE86)
      .setTimestamp();

    // Send the settings selection prompt
    await interaction.update({ embeds: [settingsSelectionEmbed], components: [sizeActionRow, gamemodeActionRow], content: null });

    // Create a collector to handle the settings selections
    const filter = i =>
      (i.customId === `mapvote_select_lobbysize_${lobby.lobbyId}` ||
        i.customId === `mapvote_select_gamemode_${lobby.lobbyId}`) &&
      i.user.id === interaction.user.id;

    const collector = interaction.channel.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

    const selections = {
      lobbySizes: null,
      gamemodes: null,
    };

    collector.on('collect', async selectInteraction => {
      if (selectInteraction.customId === `mapvote_select_lobbysize_${lobby.lobbyId}`) {
        selections.lobbySizes = selectInteraction.values;
        await selectInteraction.update({
          embeds: [settingsSelectionEmbed.setDescription(`Lobby sizes selected: ${selections.lobbySizes.join(', ')}\nNow select gamemodes.`)],
          components: [gamemodeActionRow],
          content: null,
        });
      } else if (selectInteraction.customId === `mapvote_select_gamemode_${lobby.lobbyId}`) {
        selections.gamemodes = selectInteraction.values;
        await selectInteraction.update({
          embeds: [settingsSelectionEmbed.setDescription(`Gamemodes selected: ${selections.gamemodes.join(', ')}`)],
          components: [],
          content: null,
        });

        // Proceed with the map vote
        await initiateMapVote(interaction, client, lobby, selections.lobbySizes, selections.gamemodes);
        collector.stop();
      }
    });

    collector.on('end', async collected => {
      if (!selections.lobbySizes || !selections.gamemodes) {
        await interaction.editReply({ content: `**Lobby: ${lobby.lobbyId}**\nMap vote setup timed out.`, embeds: [], components: [] });
      }
    });
  } catch (error) {
    console.error('Error during lobby settings selection:', error);
    const channel = client.channels.cache.get(lobby.messageChannelId) || interaction.channel;
    await channel.send({
      content: `**Lobby: ${lobby.lobbyId}**\nThere was an error during the map vote setup.`,
    });
  }
}

/**
 * Initiates the map vote after lobby size and gamemode selections are made.
 * @param {Interaction} interaction - The original interaction object.
 * @param {Client} client - The Discord client instance.
 * @param {Object} lobby - The lobby object.
 * @param {Array} selectedLobbySizes - Selected lobby size values.
 * @param {Array} selectedGamemodes - Selected gamemode values.
 */
async function initiateMapVote(interaction, client, lobby, selectedLobbySizes, selectedGamemodes) {
  try {
    // Fetch map options based on selections
    const mapOptions = getMapOptions(selectedLobbySizes, selectedGamemodes);

    if (mapOptions.length === 0) {
      return interaction.followUp({
        content: `**Lobby: ${lobby.lobbyId}**\nNo maps found matching the selected criteria.`,
        ephemeral: true,
      });
    }

    // Select 3 random maps
    const selectedMaps = selectRandomMaps(mapOptions, 3);

    // Create an embed with map options
    const embed = new EmbedBuilder()
      .setTitle(`Map Vote for Lobby: ${lobby.lobbyId}`)
      .setDescription(
        selectedMaps
          .map(
            (option, index) =>
              `${index + 1}️⃣ **${option['Map Name']}** - ${option['Game Mode']}`
          )
          .join('\n')
      )
      .setColor(0x00AE86)
      .setTimestamp();

    // Send the voting message in the lobby's channel
    const channel = client.channels.cache.get(lobby.messageChannelId) || interaction.channel;
    const voteMessage = await channel.send({
      embeds: [embed],
      content: 'React to vote for the next map! 30 seconds until voting closes.',
    });

    // React with number emojis
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
    for (let i = 0; i < selectedMaps.length; i++) {
      await voteMessage.react(numberEmojis[i]);
    }

    // Create a reaction collector
    const filter = (reaction, user) => {
      return numberEmojis.includes(reaction.emoji.name) && !user.bot;
    };

    const collector = voteMessage.createReactionCollector({ filter, time: 30000 });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        // No reactions were added; proceed with random selection
        const randomIndex = Math.floor(Math.random() * selectedMaps.length);
        const randomMap = selectedMaps[randomIndex];

        return channel.send({
          content: `**Lobby: ${lobby.lobbyId}**\nNo votes were cast. Randomly selected map: **${randomMap['Map Name']}** with gametype **${randomMap['Game Mode']}**.`,
        });
      }

      // Tally votes based on reactions
      const voteCounts = {};

      collected.forEach(reaction => {
        // Exclude the bot's own reactions
        const count = reaction.count - 1; // Subtract 1 for the bot's initial reaction

        if (count > 0) {
          const mapIndex = numberEmojis.indexOf(reaction.emoji.name);
          if (mapIndex !== -1) {
            const selectedMap = selectedMaps[mapIndex]['Map Name'];
            voteCounts[selectedMap] = (voteCounts[selectedMap] || 0) + count;
          }
        }
      });

      if (Object.keys(voteCounts).length === 0) {
        // No valid votes were cast; proceed with random selection
        const randomIndex = Math.floor(Math.random() * selectedMaps.length);
        const randomMap = selectedMaps[randomIndex];

        return channel.send({
          content: `**Lobby: ${lobby.lobbyId}**\nNo valid votes were cast. Randomly selected map: **${randomMap['Map Name']}** with gametype **${randomMap['Game Mode']}**.`,
        });
      }

      // Determine the map with the highest votes
      let maxVotes = 0;
      let winningMap = '';
      const tiedMaps = [];

      for (const [map, votes] of Object.entries(voteCounts)) {
        if (votes > maxVotes) {
          maxVotes = votes;
          winningMap = map;
          tiedMaps.length = 0; // Reset tiedMaps
          tiedMaps.push(map);
        } else if (votes === maxVotes) {
          tiedMaps.push(map);
        }
      }

      // Handle ties by selecting a random map from tiedMaps
      if (tiedMaps.length > 1) {
        winningMap = tiedMaps[Math.floor(Math.random() * tiedMaps.length)];
        maxVotes = voteCounts[winningMap];
      }

      await channel.send({
        content: `**Lobby: ${lobby.lobbyId}**\n**${winningMap}** has been selected with **${maxVotes}** vote(s)!`,
      });
    });
  } catch (error) {
    console.error('Error during map voting:', error);
    // Send error message directly to the channel
    const channel = client.channels.cache.get(lobby.messageChannelId) || interaction.channel;
    await channel.send({
      content: `**Lobby: ${lobby.lobbyId}**\nThere was an error during the map vote.`,
    });
  }
}
