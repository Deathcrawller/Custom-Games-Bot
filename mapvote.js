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

function selectRandomMaps(maps, count) {
  const shuffled = shuffleArray([...maps]);
  return shuffled.slice(0, count);
}

// Fisher-Yates Shuffle
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

      // Check if the user has the "Custom Games Manager" role
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      const hasRole = guildMember.roles.cache.some(role => role.name === 'Custom Games Manager');
      if (!hasRole) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      // Acknowledge the interaction immediately
      await interaction.deferReply({ ephemeral: true });

      // Iterate through each hosted lobby and initiate map vote
      for (const lobby of hostedLobbies) {
        await initiateMapVoteForLobby(interaction, client, lobby);
      }

      // Follow up to indicate that map votes have been initiated
      await interaction.followUp({ content: 'Map votes have been initiated for your active lobbies.', ephemeral: true });
    } catch (error) {
      console.error('Error executing command mapvote:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'There was an error executing the map vote command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing the map vote command.', ephemeral: true });
      }
    }
  },
};

// Function to initiate map vote for a specific lobby
async function initiateMapVoteForLobby(interaction, client, lobby) {
  try {
    // Update the lobby's last active timestamp
    lobby.lastActive = Date.now();

    // Create selection menus with unique customIds
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
    const row1 = new ActionRowBuilder().addComponents(lobbySizeMenu);
    const row2 = new ActionRowBuilder().addComponents(gamemodeMenu);

    // Send the selection menus to the channel where the lobby was created
    const channel = interaction.guild.channels.cache.get(lobby.channelId) || interaction.channel;

    // Log the initiation
    console.log(`Initiating map vote for Lobby: ${lobby.lobbyId} in Channel: ${channel.name} (${channel.id})`);

    const selectionMessage = await channel.send({
      content: `**Lobby: ${lobby.lobbyId}**\nPlease select the lobby sizes and gamemodes for the map vote.`,
      components: [row1, row2],
    });

    // Create a collector to handle selections for this lobby
    const filter = (i) =>
      (i.customId === `mapvote_select_lobbysize_${lobby.lobbyId}` ||
        i.customId === `mapvote_select_gamemode_${lobby.lobbyId}`) &&
      i.user.id === interaction.user.id;

    const collector = selectionMessage.createMessageComponentCollector({
      filter,
      componentType: ComponentType.StringSelect,
      time: 60000, // 60 seconds
    });

    const selections = {
      lobbySizes: null,
      gamemodes: null,
    };

    collector.on('collect', async (selectInteraction) => {
      if (selectInteraction.customId === `mapvote_select_lobbysize_${lobby.lobbyId}`) {
        selections.lobbySizes = selectInteraction.values;
        await selectInteraction.update({
          content: `**Lobby: ${lobby.lobbyId}**\nLobby sizes selected: ${selections.lobbySizes.join(', ')}\nNow select gamemodes.`,
          components: [row2], // Show only gamemode select menu
        });
      } else if (selectInteraction.customId === `mapvote_select_gamemode_${lobby.lobbyId}`) {
        selections.gamemodes = selectInteraction.values;
        await selectInteraction.update({
          content: `**Lobby: ${lobby.lobbyId}**\nGamemodes selected: ${selections.gamemodes.join(', ')}`,
          components: [], // Remove select menus after selections
        });

        // Proceed with the map vote
        await initiateMapVote(interaction, client, lobby, selections.lobbySizes, selections.gamemodes);
        collector.stop();
      }
    });

    collector.on('end', async (collected) => {
      if (!selections.lobbySizes || !selections.gamemodes) {
        await channel.send({
          content: `**Lobby: ${lobby.lobbyId}**\nMap vote setup timed out.`,
        });
      }
    });
  } catch (error) {
    console.error('Error initiating map vote for lobby:', error);
    // Send error message directly to the channel
    const channel = interaction.guild.channels.cache.get(lobby.channelId) || interaction.channel;
    await channel.send({
      content: `**Lobby: ${lobby.lobbyId}**\nThere was an error initiating the map vote.`,
    });
  }
}

// Function to initiate map vote after selections are made
async function initiateMapVote(interaction, client, lobby, selectedLobbySizes, selectedGamemodes) {
  try {
    // Fetch map options based on selections
    const mapOptions = getMapOptions(selectedLobbySizes, selectedGamemodes);

    if (mapOptions.length === 0) {
      return interaction.followUp({
        content: `**Lobby: ${lobby.lobbyId}**\nNo maps found matching the criteria.`,
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
    const channel = interaction.guild.channels.cache.get(lobby.channelId) || interaction.channel;
    const voteMessage = await channel.send({
      embeds: [embed],
      content: 'React with the corresponding number to vote for your preferred map!',
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

    const collector = voteMessage.createReactionCollector({ filter, time: 20000 });

    collector.on('end', async (collected) => {
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

      collected.forEach((reaction) => {
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
    const channel = interaction.guild.channels.cache.get(lobby.channelId) || interaction.channel;
    await channel.send({
      content: `**Lobby: ${lobby.lobbyId}**\nThere was an error during the map vote.`,
    });
  }
}
