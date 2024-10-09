// commands/host.js

const {
    SlashCommandBuilder,
    EmbedBuilder,
  } = require('discord.js');
  const { updateLobbyEmbed } = require('../utils/lobbyUtils');
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('host')
      .setDescription('Reassign the host of a specific lobby. (Custom Games Manager only)')
      .addStringOption(option =>
        option.setName('lobbyname')
          .setDescription('Name of the lobby to modify')
          .setRequired(true)
      )
      .addUserOption(option =>
        option.setName('newhost')
          .setDescription('Select the new host from the server')
          .setRequired(true)
      ),
  
    async execute(interaction, client) {
      const lobbyName = interaction.options.getString('lobbyname').trim();
      const newHostUser = interaction.options.getUser('newhost');
      const guildId = interaction.guild.id;
  
      // Fetch the guild member object for the new host
      const newHostMember = await interaction.guild.members.fetch(newHostUser.id).catch(() => null);
  
      if (!newHostMember) {
        return interaction.reply({
          content: `User \`${newHostUser.tag}\` not found in this server.`,
          ephemeral: true,
        });
      }
  
      // Check if the user has the "Custom Games Manager" role or is the current host
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      const hasRole = guildMember.roles.cache.some(
        (role) => role.name === 'Custom Games Manager'
      );
  
      // Find the lobby by name and guild
      const lobby = Array.from(client.lobbies.values()).find(
        l => l.lobbyId.toLowerCase() === lobbyName.toLowerCase() && l.guildId === guildId
      );
  
      if (!lobby) {
        return interaction.reply({ 
          content: `No lobby named **${lobbyName}** found in this server.`, 
          ephemeral: true 
        });
      }
  
      if (interaction.user.id !== lobby.hostId && !hasRole) {
        return interaction.reply({ 
          content: 'You do not have permission to reassign the host for this lobby.', 
          ephemeral: true 
        });
      }
  
      // Prevent reassigning to the same host
      if (newHostUser.id === lobby.hostId) {
        return interaction.reply({
          content: `\`${newHostUser.tag}\` is already the host of lobby **${lobby.lobbyId}**.`,
          ephemeral: true,
        });
      }
  
      // Reassign the host
      const oldHostId = lobby.hostId;
      lobby.hostId = newHostUser.id;
  
      // Update the lobby embed/message
      await updateLobbyEmbed(lobby, client);
  
      // Notify the old host
      const oldHost = interaction.guild.members.cache.get(oldHostId);
      if (oldHost) {
        try {
          await oldHost.send(
            `You are no longer the host of lobby \`${lobby.lobbyId}\`. The new host is <@${newHostUser.id}>.`
          );
        } catch (err) {
          console.error(`Could not send DM to the old host (${oldHost.user.tag}).`);
        }
      }
  
      // Notify the new host
      try {
        await newHostMember.send(
          `You have been assigned as the new host for lobby \`${lobby.lobbyId}\`.`
        );
      } catch (err) {
        console.error(`Could not send DM to the new host (${newHostMember.user.tag}).`);
      }
  
      // Confirm the reassignment to the manager
      await interaction.reply({
        content: `Host for lobby \`${lobby.lobbyId}\` has been reassigned to <@${newHostUser.id}>.`,
        ephemeral: true,
      });
    },
  };
  