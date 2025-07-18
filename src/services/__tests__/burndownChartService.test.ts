import { BurndownChartService } from '../burndownChartService';
import { CreateBurndownChartData, UpdateProgressData } from '../../models/burndownChart';
import { BurndownChartStorage } from '../../utils/burndownChartStorage';
import * as fs from 'fs';
import * as path from 'path';

describe('BurndownChartService', () => {
  let service: BurndownChartService;
  let testDataPath: string;

  beforeEach(() => {
    // Use a unique test file for each test run
    testDataPath = path.join(__dirname, `../../../data/test-burndownCharts-${Date.now()}-${Math.random()}.json`);
    const storage = new BurndownChartStorage(testDataPath);
    service = new BurndownChartService(storage);
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
  });

  describe('createChart', () => {
    it('should create a new burndown chart with valid data', async () => {
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      const chart = await service.createChart(chartData);

      expect(chart.id).toBeDefined();
      expect(chart.userId).toBe('user123');
      expect(chart.title).toBe('Sprint 1');
      expect(chart.totalPoints).toBe(100);
      expect(chart.currentPoints).toBe(100);
      expect(chart.progressEntries).toHaveLength(0);
      expect(chart.isActive).toBe(true);
      expect(chart.createdAt).toBeInstanceOf(Date);
      expect(chart.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw error for invalid date range', async () => {
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-14',
        endDate: '2024-01-01' // End date before start date
      };

      await expect(service.createChart(chartData)).rejects.toThrow('End date must be after start date');
    });

    it('should throw error for negative total points', async () => {
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: -10,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      await expect(service.createChart(chartData)).rejects.toThrow('Total points must be greater than 0');
    });

    it('should throw error for missing required fields', async () => {
      const chartData: CreateBurndownChartData = {
        userId: '',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      await expect(service.createChart(chartData)).rejects.toThrow('User ID is required');
    });
  });

  describe('updateProgress', () => {
    it('should update progress and add progress entry', async () => {
      // First create a chart
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      const chart = await service.createChart(chartData);

      // Update progress
      const updateData: UpdateProgressData = {
        chartId: chart.id,
        pointsBurned: 20,
        note: 'Completed user stories 1-3'
      };

      const updatedChart = await service.updateProgress(updateData);

      expect(updatedChart.currentPoints).toBe(80);
      expect(updatedChart.progressEntries).toHaveLength(1);
      expect(updatedChart.progressEntries[0].pointsBurned).toBe(20);
      expect(updatedChart.progressEntries[0].pointsRemaining).toBe(80);
      expect(updatedChart.progressEntries[0].note).toBe('Completed user stories 1-3');
    });

    it('should throw error when burning more points than remaining', async () => {
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      const chart = await service.createChart(chartData);

      const updateData: UpdateProgressData = {
        chartId: chart.id,
        pointsBurned: 150 // More than total points
      };

      await expect(service.updateProgress(updateData)).rejects.toThrow('Cannot burn more points than remaining');
    });
  });

  describe('getUserCharts', () => {
    it('should return charts for specific user', async () => {
      const chartData1: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      const chartData2: CreateBurndownChartData = {
        userId: 'user456',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 2',
        totalPoints: 80,
        startDate: '2024-01-15',
        endDate: '2024-01-28'
      };

      await service.createChart(chartData1);
      await service.createChart(chartData2);

      const userCharts = await service.getUserCharts('user123');

      expect(userCharts).toHaveLength(1);
      expect(userCharts[0].userId).toBe('user123');
      expect(userCharts[0].title).toBe('Sprint 1');
    });
  });

  describe('deleteChart', () => {
    it('should delete a chart', async () => {
      const chartData: CreateBurndownChartData = {
        userId: 'user123',
        channelId: 'channel123',
        guildId: 'guild123',
        title: 'Sprint 1',
        totalPoints: 100,
        startDate: '2024-01-01',
        endDate: '2024-01-14'
      };

      const chart = await service.createChart(chartData);

      await service.deleteChart(chart.id);

      const userCharts = await service.getUserCharts('user123');
      expect(userCharts).toHaveLength(0);
    });
  });
});
