/**
 * Metrics Export System for Production Monitoring
 * 
 * Provides metrics collection, aggregation, and export functionality
 * for integration with monitoring systems like DataDog, New Relic,
 * Prometheus, and custom monitoring solutions.
 * 
 * @category Utils
 * @subcategory Monitoring
 * @since 1.5.1
 */

/**
 * Metric types for different monitoring purposes.
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer'
}

/**
 * Metric data point interface.
 */
export interface MetricDataPoint {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Timestamp when metric was recorded */
  timestamp: number;
  /** Metric tags for filtering and grouping */
  tags?: Record<string, string>;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Aggregated metric summary.
 */
export interface MetricSummary {
  /** Metric name */
  name: string;
  /** Total count of data points */
  count: number;
  /** Sum of all values */
  sum: number;
  /** Average value */
  avg: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** 95th percentile (if applicable) */
  p95?: number;
  /** 99th percentile (if applicable) */
  p99?: number;
  /** Tags associated with this metric */
  tags?: Record<string, string>;
}

/**
 * Search-specific metric names for consistency.
 */
export const SEARCH_METRICS = {
  // Performance metrics
  SEARCH_RESPONSE_TIME: 'search.response_time',
  HIGHLIGHTING_DURATION: 'search.highlighting.duration',
  RESULTS_RENDER_TIME: 'search.results.render_time',
  
  // Usage metrics
  SEARCH_QUERIES_TOTAL: 'search.queries.total',
  SEARCH_RESULTS_COUNT: 'search.results.count',
  SEARCH_EMPTY_RESULTS: 'search.results.empty',
  
  // Error metrics
  SEARCH_ERRORS_TOTAL: 'search.errors.total',
  HIGHLIGHTING_ERRORS: 'search.highlighting.errors',
  VALIDATION_FAILURES: 'search.validation.failures',
  
  // Security metrics
  XSS_ATTEMPTS_BLOCKED: 'security.xss.attempts_blocked',
  MALICIOUS_INPUT_DETECTED: 'security.input.malicious_detected',
  
  // Navigation metrics
  ITEM_DETAIL_VIEWS: 'navigation.item_detail.views',
  BREADCRUMB_CLICKS: 'navigation.breadcrumb.clicks',
  KEYBOARD_NAVIGATION_USAGE: 'navigation.keyboard.usage',
} as const;

/**
 * Metrics collection and export service.
 */
export class MetricsCollector {
  private metrics: MetricDataPoint[] = [];
  private aggregatedMetrics: Map<string, MetricDataPoint[]> = new Map();
  private exportInterval?: NodeJS.Timeout;
  private config: MetricsConfig;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.setupExportInterval();
  }

  /**
   * Record a counter metric (monotonically increasing).
   */
  counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.COUNTER,
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  /**
   * Record a gauge metric (point-in-time value).
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.GAUGE,
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  /**
   * Record a histogram metric (distribution of values).
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.HISTOGRAM,
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  /**
   * Record a timer metric (duration measurement).
   */
  timer(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.TIMER,
      value: durationMs,
      timestamp: Date.now(),
      tags,
    });
  }

  /**
   * Time a function execution and record the duration.
   */
  async timeFunction<T>(
    name: string,
    fn: () => Promise<T> | T,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.timer(name, Math.round(duration), { ...tags, status: 'success' });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.timer(name, Math.round(duration), { ...tags, status: 'error' });
      this.counter(`${name}.errors`, 1, tags);
      throw error;
    }
  }

  /**
   * Record a metric data point.
   */
  private recordMetric(metric: MetricDataPoint): void {
    if (!this.config.enabled) return;

    this.metrics.push(metric);
    
    // Group metrics for aggregation
    const key = this.getMetricKey(metric.name, metric.tags);
    if (!this.aggregatedMetrics.has(key)) {
      this.aggregatedMetrics.set(key, []);
    }
    this.aggregatedMetrics.get(key)!.push(metric);

    // Clean old metrics to prevent memory issues
    this.cleanOldMetrics();
  }

  /**
   * Generate metric key for grouping.
   */
  private getMetricKey(name: string, tags?: Record<string, string>): string {
    const tagString = tags ? Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',') : '';
    return `${name}:${tagString}`;
  }

  /**
   * Clean metrics older than retention period.
   */
  private cleanOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.retentionMs;
    
    this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    
    this.aggregatedMetrics.forEach((values, key) => {
      const filteredValues = values.filter(m => m.timestamp > cutoffTime);
      if (filteredValues.length === 0) {
        this.aggregatedMetrics.delete(key);
      } else {
        this.aggregatedMetrics.set(key, filteredValues);
      }
    });
  }

  /**
   * Get aggregated metric summaries.
   */
  getSummaries(): MetricSummary[] {
    const summaries: MetricSummary[] = [];

    this.aggregatedMetrics.forEach((values, key) => {
      const [name] = key.split(':');
      const tags = this.parseTagsFromKey(key);
      
      if (values.length === 0) return;

      const numericValues = values.map(v => v.value).sort((a, b) => a - b);
      const sum = numericValues.reduce((a, b) => a + b, 0);

      const summary: MetricSummary = {
        name,
        count: values.length,
        sum,
        avg: sum / values.length,
        min: numericValues[0],
        max: numericValues[numericValues.length - 1],
        tags,
      };

      // Calculate percentiles for performance metrics
      if (values[0]?.type === MetricType.TIMER || values[0]?.type === MetricType.HISTOGRAM) {
        const p95Index = Math.floor(numericValues.length * 0.95);
        const p99Index = Math.floor(numericValues.length * 0.99);
        summary.p95 = numericValues[p95Index];
        summary.p99 = numericValues[p99Index];
      }

      summaries.push(summary);
    });

    return summaries;
  }

  /**
   * Parse tags from metric key.
   */
  private parseTagsFromKey(key: string): Record<string, string> | undefined {
    const [, tagString] = key.split(':');
    if (!tagString) return undefined;

    const tags: Record<string, string> = {};
    tagString.split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) tags[k] = v;
    });

    return Object.keys(tags).length > 0 ? tags : undefined;
  }

  /**
   * Export metrics to configured endpoints.
   */
  async exportMetrics(): Promise<void> {
    if (!this.config.enabled || this.metrics.length === 0) return;

    const summaries = this.getSummaries();
    const exportData = {
      timestamp: Date.now(),
      summaries,
      environment: process.env.NODE_ENV || 'development',
      service: 'inventory-mgmt-frontend',
    };

    // Export to all configured endpoints
    const exportPromises: Promise<void>[] = [];

    if (this.config.datadog?.enabled) {
      exportPromises.push(this.exportToDatadog(exportData));
    }

    if (this.config.prometheus?.enabled) {
      exportPromises.push(this.exportToPrometheus(exportData));
    }

    if (this.config.custom?.enabled) {
      exportPromises.push(this.exportToCustomEndpoint(exportData));
    }

    try {
      await Promise.all(exportPromises);
      
      // Clear metrics after successful export
      if (this.config.clearAfterExport) {
        this.metrics = [];
        this.aggregatedMetrics.clear();
      }
    } catch (error) {
      console.error('Failed to export metrics:', error);
      this.counter('metrics.export.errors', 1, { error: (error as Error).message });
    }
  }

  /**
   * Export metrics to DataDog.
   */
  private async exportToDatadog(data: any): Promise<void> {
    const { endpoint, apiKey } = this.config.datadog!;
    
    const datadogMetrics = data.summaries.map((summary: MetricSummary) => ({
      metric: summary.name,
      points: [[Math.floor(data.timestamp / 1000), summary.avg]],
      tags: summary.tags ? Object.entries(summary.tags).map(([k, v]) => `${k}:${v}`) : [],
      type: 'gauge',
    }));

    const response = await fetch(`${endpoint}/api/v1/series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey!,
      },
      body: JSON.stringify({ series: datadogMetrics }),
    });

    if (!response.ok) {
      throw new Error(`DataDog export failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Export metrics to Prometheus format.
   */
  private async exportToPrometheus(data: any): Promise<void> {
    const { endpoint } = this.config.prometheus!;
    
    let prometheusFormat = '';
    data.summaries.forEach((summary: MetricSummary) => {
      const metricName = summary.name.replace(/\./g, '_');
      const labels = summary.tags ? 
        Object.entries(summary.tags).map(([k, v]) => `${k}="${v}"`).join(',') : '';
      
      prometheusFormat += `# TYPE ${metricName} gauge\n`;
      prometheusFormat += `${metricName}{${labels}} ${summary.avg} ${data.timestamp}\n`;
      
      if (summary.p95 !== undefined) {
        prometheusFormat += `# TYPE ${metricName}_p95 gauge\n`;
        prometheusFormat += `${metricName}_p95{${labels}} ${summary.p95} ${data.timestamp}\n`;
      }
    });

    const response = await fetch(endpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: prometheusFormat,
    });

    if (!response.ok) {
      throw new Error(`Prometheus export failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Export metrics to custom endpoint.
   */
  private async exportToCustomEndpoint(data: any): Promise<void> {
    const { endpoint, headers } = this.config.custom!;
    
    const response = await fetch(endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Custom endpoint export failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Setup automatic metrics export interval.
   */
  private setupExportInterval(): void {
    if (this.config.exportIntervalMs > 0) {
      this.exportInterval = setInterval(() => {
        this.exportMetrics();
      }, this.config.exportIntervalMs);
    }
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
    }
    this.exportMetrics(); // Final export
  }
}

/**
 * Metrics configuration interface.
 */
export interface MetricsConfig {
  /** Whether metrics collection is enabled */
  enabled: boolean;
  /** Metrics retention period in milliseconds */
  retentionMs: number;
  /** Export interval in milliseconds */
  exportIntervalMs: number;
  /** Whether to clear metrics after export */
  clearAfterExport: boolean;
  /** DataDog configuration */
  datadog?: {
    enabled: boolean;
    endpoint: string;
    apiKey: string;
  };
  /** Prometheus configuration */
  prometheus?: {
    enabled: boolean;
    endpoint: string;
  };
  /** Custom endpoint configuration */
  custom?: {
    enabled: boolean;
    endpoint: string;
    headers?: Record<string, string>;
  };
}

/**
 * Default metrics configuration.
 */
const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  enabled: process.env.NODE_ENV === 'production',
  retentionMs: 5 * 60 * 1000, // 5 minutes
  exportIntervalMs: 60 * 1000, // 1 minute
  clearAfterExport: true,
  datadog: {
    enabled: false,
    endpoint: 'https://api.datadoghq.com',
    apiKey: process.env.DATADOG_API_KEY || '',
  },
  prometheus: {
    enabled: false,
    endpoint: process.env.PROMETHEUS_ENDPOINT || '',
  },
  custom: {
    enabled: false,
    endpoint: process.env.CUSTOM_METRICS_ENDPOINT || '',
  },
};

/**
 * Global metrics collector instance.
 */
export const metrics = new MetricsCollector();

/**
 * Search-specific metrics helpers.
 */
export const searchMetrics = {
  /**
   * Record search query performance.
   */
  recordSearchQuery(responseTimeMs: number, resultCount: number, method: string): void {
    metrics.timer(SEARCH_METRICS.SEARCH_RESPONSE_TIME, responseTimeMs, { method });
    metrics.counter(SEARCH_METRICS.SEARCH_QUERIES_TOTAL, 1, { method });
    metrics.histogram(SEARCH_METRICS.SEARCH_RESULTS_COUNT, resultCount, { method });
    
    if (resultCount === 0) {
      metrics.counter(SEARCH_METRICS.SEARCH_EMPTY_RESULTS, 1, { method });
    }
  },

  /**
   * Record text highlighting performance.
   */
  recordHighlighting(durationMs: number, termCount: number, success: boolean): void {
    metrics.timer(SEARCH_METRICS.HIGHLIGHTING_DURATION, durationMs, {
      success: success.toString(),
      terms: termCount.toString(),
    });
    
    if (!success) {
      metrics.counter(SEARCH_METRICS.HIGHLIGHTING_ERRORS, 1);
    }
  },

  /**
   * Record security event.
   */
  recordSecurityEvent(eventType: 'xss' | 'injection' | 'validation', blocked: boolean): void {
    if (eventType === 'xss' && blocked) {
      metrics.counter(SEARCH_METRICS.XSS_ATTEMPTS_BLOCKED, 1);
    }
    
    if (blocked) {
      metrics.counter(SEARCH_METRICS.MALICIOUS_INPUT_DETECTED, 1, { type: eventType });
    }
  },

  /**
   * Record navigation event.
   */
  recordNavigation(action: 'item_view' | 'breadcrumb_click' | 'keyboard_nav'): void {
    switch (action) {
      case 'item_view':
        metrics.counter(SEARCH_METRICS.ITEM_DETAIL_VIEWS, 1);
        break;
      case 'breadcrumb_click':
        metrics.counter(SEARCH_METRICS.BREADCRUMB_CLICKS, 1);
        break;
      case 'keyboard_nav':
        metrics.counter(SEARCH_METRICS.KEYBOARD_NAVIGATION_USAGE, 1);
        break;
    }
  },
};