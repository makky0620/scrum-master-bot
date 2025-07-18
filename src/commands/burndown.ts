import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { Command } from '../command';
import { BurndownChartService } from '../services/burndownChartService';
import { CreateBurndownChartData, UpdateProgressData } from '../models/burndownChart';
import dayjs from 'dayjs';

const burndownService = new BurndownChartService();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('burndown')
    .setDescription('Manage burndown charts for sprint tracking')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new burndown chart')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title of the burndown chart')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('total_points')
            .setDescription('Total story points for the sprint')
            .setRequired(true)
            .setMinValue(1))
        .addStringOption(option =>
          option
            .setName('start_date')
            .setDescription('Start date (YYYY-MM-DD format)')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('end_date')
            .setDescription('End date (YYYY-MM-DD format)')
            .setRequired(true))
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for the burndown chart (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update progress on a burndown chart')
        .addStringOption(option =>
          option
            .setName('chart_id')
            .setDescription('ID of the burndown chart')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('points_burned')
            .setDescription('Number of points to burn down')
            .setRequired(true)
            .setMinValue(0))
        .addStringOption(option =>
          option
            .setName('note')
            .setDescription('Optional note about the progress')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View a burndown chart')
        .addStringOption(option =>
          option
            .setName('chart_id')
            .setDescription('ID of the burndown chart')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your burndown charts'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a burndown chart')
        .addStringOption(option =>
          option
            .setName('chart_id')
            .setDescription('ID of the burndown chart')
            .setRequired(true))) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        await handleCreate(interaction);
        break;
      case 'update':
        await handleUpdate(interaction);
        break;
      case 'view':
        await handleView(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
      case 'delete':
        await handleDelete(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          flags: MessageFlags.Ephemeral,
        });
    }
  },
};

async function handleCreate(interaction: ChatInputCommandInteraction) {
  try {
    const title = interaction.options.getString('title', true);
    const totalPoints = interaction.options.getInteger('total_points', true);
    const startDate = interaction.options.getString('start_date', true);
    const endDate = interaction.options.getString('end_date', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel || !('id' in channel)) {
      await interaction.reply({
        content: 'Invalid channel specified.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const chartData: CreateBurndownChartData = {
      userId: interaction.user.id,
      channelId: channel.id,
      guildId: interaction.guildId!,
      title,
      totalPoints,
      startDate,
      endDate,
    };

    const chart = await burndownService.createChart(chartData);

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Burndown Chart Created')
      .setDescription(`Successfully created burndown chart: **${chart.title}**`)
      .addFields(
        { name: 'Chart ID', value: chart.id, inline: true },
        { name: 'Total Points', value: chart.totalPoints.toString(), inline: true },
        { name: 'Current Points', value: chart.currentPoints.toString(), inline: true },
        { name: 'Start Date', value: dayjs(chart.startDate).format('YYYY-MM-DD'), inline: true },
        { name: 'End Date', value: dayjs(chart.endDate).format('YYYY-MM-DD'), inline: true },
        { name: 'Channel', value: `<#${chart.channelId}>`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Use /burndown update chart_id:${chart.id} to track progress` });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error creating burndown chart:', error);
    await interaction.reply({
      content: `Error creating burndown chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleUpdate(interaction: ChatInputCommandInteraction) {
  try {
    const chartId = interaction.options.getString('chart_id', true);
    const pointsBurned = interaction.options.getInteger('points_burned', true);
    const note = interaction.options.getString('note');

    const updateData: UpdateProgressData = {
      chartId,
      pointsBurned,
      note: note || undefined,
    };

    const updatedChart = await burndownService.updateProgress(updateData);

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📈 Progress Updated')
      .setDescription(`Updated progress for: **${updatedChart.title}**`)
      .addFields(
        { name: 'Points Burned', value: pointsBurned.toString(), inline: true },
        { name: 'Points Remaining', value: updatedChart.currentPoints.toString(), inline: true },
        { name: 'Total Points', value: updatedChart.totalPoints.toString(), inline: true }
      );

    if (note) {
      embed.addFields({ name: 'Note', value: note });
    }

    // Add progress bar
    const progressPercentage = ((updatedChart.totalPoints - updatedChart.currentPoints) / updatedChart.totalPoints) * 100;
    const progressBar = createProgressBar(progressPercentage);
    embed.addFields({ name: 'Progress', value: `${progressBar} ${progressPercentage.toFixed(1)}%` });

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating burndown chart:', error);
    await interaction.reply({
      content: `Error updating burndown chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleView(interaction: ChatInputCommandInteraction) {
  try {
    const chartId = interaction.options.getString('chart_id', true);
    const chart = await burndownService.getChartById(chartId);

    if (!chart) {
      await interaction.reply({
        content: 'Burndown chart not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const progressPercentage = ((chart.totalPoints - chart.currentPoints) / chart.totalPoints) * 100;
    const progressBar = createProgressBar(progressPercentage);

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`📊 ${chart.title}`)
      .setDescription(`Burndown chart details`)
      .addFields(
        { name: 'Chart ID', value: chart.id, inline: true },
        { name: 'Total Points', value: chart.totalPoints.toString(), inline: true },
        { name: 'Points Remaining', value: chart.currentPoints.toString(), inline: true },
        { name: 'Start Date', value: dayjs(chart.startDate).format('YYYY-MM-DD'), inline: true },
        { name: 'End Date', value: dayjs(chart.endDate).format('YYYY-MM-DD'), inline: true },
        { name: 'Status', value: chart.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Progress', value: `${progressBar} ${progressPercentage.toFixed(1)}%` }
      );

    // Add recent progress entries
    if (chart.progressEntries.length > 0) {
      const recentEntries = chart.progressEntries
        .slice(-3)
        .map(entry => `${dayjs(entry.date).format('MM/DD')} - Burned ${entry.pointsBurned} points${entry.note ? ` (${entry.note})` : ''}`)
        .join('\n');
      embed.addFields({ name: 'Recent Progress', value: recentEntries });
    }

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error viewing burndown chart:', error);
    await interaction.reply({
      content: `Error viewing burndown chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction) {
  try {
    const charts = await burndownService.getUserCharts(interaction.user.id);

    if (charts.length === 0) {
      await interaction.reply({
        content: 'You have no burndown charts. Use `/burndown create` to create one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📊 Your Burndown Charts')
      .setDescription(`You have ${charts.length} burndown chart(s):`);

    charts.forEach(chart => {
      const progressPercentage = ((chart.totalPoints - chart.currentPoints) / chart.totalPoints) * 100;
      const status = chart.isActive ? '🟢' : '🔴';
      embed.addFields({
        name: `${status} ${chart.title}`,
        value: `ID: \`${chart.id}\`\nProgress: ${progressPercentage.toFixed(1)}% (${chart.currentPoints}/${chart.totalPoints} points remaining)\nPeriod: ${dayjs(chart.startDate).format('MM/DD')} - ${dayjs(chart.endDate).format('MM/DD')}`,
        inline: false
      });
    });

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error listing burndown charts:', error);
    await interaction.reply({
      content: `Error listing burndown charts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  try {
    const chartId = interaction.options.getString('chart_id', true);

    // Check if chart exists and belongs to user
    const chart = await burndownService.getChartById(chartId);
    if (!chart) {
      await interaction.reply({
        content: 'Burndown chart not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (chart.userId !== interaction.user.id) {
      await interaction.reply({
        content: 'You can only delete your own burndown charts.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await burndownService.deleteChart(chartId);

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🗑️ Burndown Chart Deleted')
      .setDescription(`Successfully deleted burndown chart: **${chart.title}**`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error deleting burndown chart:', error);
    await interaction.reply({
      content: `Error deleting burndown chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function createProgressBar(percentage: number): string {
  const totalBars = 10;
  const filledBars = Math.round((percentage / 100) * totalBars);
  const emptyBars = totalBars - filledBars;

  return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
}

module.exports = command;
