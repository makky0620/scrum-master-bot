import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Command } from '../command';
import { ReminderService, CreateReminderData, UpdateReminderData } from '../services/reminderService';

const reminderService = new ReminderService();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Manage reminders')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new reminder')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title of the reminder')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Message content of the reminder')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('When to trigger (e.g., "14:30", "2h", "2024-07-15 14:30")')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Type of reminder')
            .setRequired(true)
            .addChoices(
              { name: 'Once', value: 'once' },
              { name: 'Recurring', value: 'recurring' }
            )
        )
        .addStringOption(option =>
          option
            .setName('recurring')
            .setDescription('Recurring interval (required for recurring reminders)')
            .setRequired(false)
            .addChoices(
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' },
              { name: 'Custom', value: 'custom' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('custom_interval')
            .setDescription('Custom interval in minutes (for custom recurring)')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('skip_weekends')
            .setDescription('Skip weekends for recurring reminders')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('allowed_days')
            .setDescription('Allowed days (0=Sun,1=Mon,...,6=Sat) e.g., "1,2,3,4,5"')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('end_date')
            .setDescription('End date for recurring reminders (YYYY-MM-DD)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('max_occurrences')
            .setDescription('Maximum number of occurrences')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your reminders')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a reminder')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID of the reminder to delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit a reminder')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID of the reminder to edit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('New title')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('New message')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('New time')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('active')
            .setDescription('Set reminder active/inactive')
            .setRequired(false)
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'create':
          await handleCreate(interaction);
          break;
        case 'list':
          await handleList(interaction);
          break;
        case 'delete':
          await handleDelete(interaction);
          break;
        case 'edit':
          await handleEdit(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      console.error('[Reminder Command] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Error: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `Error: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const title = interaction.options.getString('title', true);
  const message = interaction.options.getString('message', true);
  const time = interaction.options.getString('time', true);
  const type = interaction.options.getString('type', true) as 'once' | 'recurring';
  const recurring = interaction.options.getString('recurring');
  const customInterval = interaction.options.getInteger('custom_interval');
  const skipWeekends = interaction.options.getBoolean('skip_weekends');
  const allowedDaysStr = interaction.options.getString('allowed_days');
  const endDateStr = interaction.options.getString('end_date');
  const maxOccurrences = interaction.options.getInteger('max_occurrences');

  // Validate recurring options
  if (type === 'recurring' && !recurring) {
    await interaction.reply({
      content: 'Recurring interval is required for recurring reminders.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (recurring === 'custom' && !customInterval) {
    await interaction.reply({
      content: 'Custom interval is required when using custom recurring type.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse allowed days
  let allowedDays: number[] | undefined;
  if (allowedDaysStr) {
    try {
      allowedDays = allowedDaysStr.split(',').map(d => parseInt(d.trim()));
      if (allowedDays.some(d => d < 0 || d > 6)) {
        throw new Error('Invalid day number');
      }
    } catch (error) {
      await interaction.reply({
        content: 'Invalid allowed_days format. Use comma-separated numbers 0-6 (0=Sunday, 6=Saturday).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Parse end date
  let endDate: Date | undefined;
  if (endDateStr) {
    endDate = new Date(endDateStr);
    if (isNaN(endDate.getTime())) {
      await interaction.reply({
        content: 'Invalid end date format. Use YYYY-MM-DD.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const createData: CreateReminderData = {
    userId: interaction.user.id,
    channelId: interaction.channelId!,
    guildId: interaction.guildId!,
    title,
    message,
    time,
    type,
  };

  if (type === 'recurring' && recurring) {
    createData.recurringConfig = {
      interval: recurring as any,
      currentCount: 0,
    };

    if (customInterval) {
      createData.recurringConfig.customInterval = customInterval;
    }

    if (endDate) {
      createData.recurringConfig.endDate = endDate;
    }

    if (maxOccurrences) {
      createData.recurringConfig.maxOccurrences = maxOccurrences;
    }

    if (skipWeekends || allowedDays) {
      createData.recurringConfig.dayFilter = {
        skipWeekends: skipWeekends || false,
        allowedDays,
      };
    }
  }

  const reminder = await reminderService.createReminder(createData);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('✅ Reminder Created')
    .setDescription(`**${reminder.title}** has been created successfully!`)
    .addFields(
      { name: 'Message', value: reminder.message, inline: false },
      { name: 'Next Trigger', value: reminder.nextTriggerTime.toLocaleString(), inline: true },
      { name: 'Type', value: reminder.type, inline: true },
      { name: 'ID', value: reminder.id, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Scrum Owl Reminder' });

  if (reminder.recurringConfig) {
    const config = reminder.recurringConfig;
    embed.addFields({ name: 'Interval', value: config.interval, inline: true });
    
    if (config.dayFilter?.skipWeekends) {
      embed.addFields({ name: 'Skip Weekends', value: 'Yes', inline: true });
    }
    
    if (config.dayFilter?.allowedDays) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const allowedDayNames = config.dayFilter.allowedDays.map(d => dayNames[d]).join(', ');
      embed.addFields({ name: 'Allowed Days', value: allowedDayNames, inline: true });
    }
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const reminders = await reminderService.getUserReminders(interaction.user.id);

  if (reminders.length === 0) {
    await interaction.reply({
      content: 'You have no reminders.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📋 Your Reminders')
    .setTimestamp()
    .setFooter({ text: 'Scrum Owl Reminder' });

  const activeReminders = reminders.filter(r => r.isActive);
  const inactiveReminders = reminders.filter(r => !r.isActive);

  if (activeReminders.length > 0) {
    const activeList = activeReminders.map(r => {
      const nextTrigger = r.nextTriggerTime.toLocaleString();
      const typeInfo = r.type === 'recurring' ? ` (${r.recurringConfig?.interval})` : '';
      return `**${r.title}**${typeInfo}\nID: \`${r.id}\`\nNext: ${nextTrigger}`;
    }).join('\n\n');

    embed.addFields({ name: '🟢 Active Reminders', value: activeList, inline: false });
  }

  if (inactiveReminders.length > 0) {
    const inactiveList = inactiveReminders.map(r => {
      return `**${r.title}**\nID: \`${r.id}\``;
    }).join('\n\n');

    embed.addFields({ name: '🔴 Inactive Reminders', value: inactiveList, inline: false });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString('id', true);

  // Check if reminder exists and belongs to user
  const reminders = await reminderService.getUserReminders(interaction.user.id);
  const reminder = reminders.find(r => r.id === id);

  if (!reminder) {
    await interaction.reply({
      content: 'Reminder not found or you do not have permission to delete it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await reminderService.deleteReminder(id);

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🗑️ Reminder Deleted')
    .setDescription(`**${reminder.title}** has been deleted successfully.`)
    .setTimestamp()
    .setFooter({ text: 'Scrum Owl Reminder' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleEdit(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString('id', true);
  const title = interaction.options.getString('title');
  const message = interaction.options.getString('message');
  const time = interaction.options.getString('time');
  const active = interaction.options.getBoolean('active');

  // Check if reminder exists and belongs to user
  const reminders = await reminderService.getUserReminders(interaction.user.id);
  const reminder = reminders.find(r => r.id === id);

  if (!reminder) {
    await interaction.reply({
      content: 'Reminder not found or you do not have permission to edit it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const updateData: UpdateReminderData = { id };

  if (title !== null) updateData.title = title;
  if (message !== null) updateData.message = message;
  if (time !== null) updateData.time = time;
  if (active !== null) updateData.isActive = active;

  const updatedReminder = await reminderService.updateReminder(updateData);

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('✏️ Reminder Updated')
    .setDescription(`**${updatedReminder.title}** has been updated successfully.`)
    .addFields(
      { name: 'Message', value: updatedReminder.message, inline: false },
      { name: 'Next Trigger', value: updatedReminder.nextTriggerTime.toLocaleString(), inline: true },
      { name: 'Status', value: updatedReminder.isActive ? 'Active' : 'Inactive', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Scrum Owl Reminder' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = command;