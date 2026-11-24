process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'webapp-api';
process.env.OTEL_NODE_RESOURCE_DETECTORS = 'env,host,os';
process.env.OTEL_METRIC_EXPORT_TIMEOUT = process.env.OTEL_METRIC_EXPORT_TIMEOUT || '10000';
process.env.OTEL_LOGS_EXPORTER = 'none';

const { diag, DiagConsoleLogger, DiagLogLevel, trace, SpanStatusCode } = require('@opentelemetry/api');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

if (process.env.OTEL_DEBUG) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

const BASE_URL = process.env.O2_URL || 'http://localhost:5080/api/default';
const headers = { Authorization: `Basic ${process.env.O2_BASIC_TOKEN}` };

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: `${BASE_URL}/v1/traces`, headers }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${BASE_URL}/v1/metrics`, headers }),
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { ignoreLayersType: ['middleware'] },
      '@opentelemetry/instrumentation-undici': { enabled: false },
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

sdk.start();

// Spans manuales para better-sqlite3 (no tiene auto-instrumentación)
const Database = require('better-sqlite3');
const tracer = trace.getTracer('better-sqlite3');
const stmtProto = Object.getPrototypeOf(new Database(':memory:').prepare('SELECT 1'));

['run', 'get', 'all'].forEach((op) => {
  const original = stmtProto[op];
  stmtProto[op] = function (...args) {
    return tracer.startActiveSpan(`sqlite ${op}`, {
      attributes: { 'db.system': 'sqlite', 'db.operation': op, 'db.statement': this.source },
    }, (span) => {
      try {
        return original.apply(this, args);
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    });
  };
});

// Cierre limpio: vacía trazas, métricas y logs pendientes
const cerrar = async () => {
  try {
    await require('./logger').vaciar();
    await sdk.shutdown();
  } finally {
    process.exit(0);
  }
};
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);