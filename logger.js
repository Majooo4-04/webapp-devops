const { trace } = require('@opentelemetry/api');

const BASE_URL = process.env.O2_URL || 'http://localhost:5080/api/default';
const SERVICE = process.env.OTEL_SERVICE_NAME || 'webapp-api';
const SEVERIDAD = { INFO: 9, WARN: 13, ERROR: 17 };

// Solo envía a OpenObserve si hay token configurado (producción o pruebas locales con OpenObserve)
const HABILITADO = Boolean(process.env.O2_BASIC_TOKEN);
const SILENCIOSO = process.env.NODE_ENV === 'test';

let cola = [];

function valorOtlp(v) {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'boolean') return { boolValue: v };
  return { stringValue: String(v) };
}

async function enviar() {
  if (!HABILITADO || cola.length === 0) return;
  const lote = cola;
  cola = [];
  const cuerpo = {
    resourceLogs: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: SERVICE } }] },
      scopeLogs: [{ scope: { name: 'webapp-api' }, logRecords: lote }],
    }],
  };
  try {
    const r = await fetch(`${BASE_URL}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${process.env.O2_BASIC_TOKEN}`,
      },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) console.error('Error enviando logs a OpenObserve. HTTP', r.status);
  } catch (err) {
    console.error('No se pudo enviar logs a OpenObserve:', err.message);
  }
}

function log(nivel, mensaje, atributos = {}) {
  if (!SILENCIOSO) console.log(JSON.stringify({ nivel, mensaje, ...atributos }));
  if (!HABILITADO) return;

  const span = trace.getActiveSpan();
  const ctx = span ? span.spanContext() : null;
  const registro = {
    timeUnixNano: String(BigInt(Date.now()) * 1000000n),
    severityNumber: SEVERIDAD[nivel] || 9,
    severityText: nivel,
    body: { stringValue: mensaje },
    attributes: Object.entries(atributos).map(([key, v]) => ({ key, value: valorOtlp(v) })),
  };
  if (ctx) {
    registro.traceId = ctx.traceId;
    registro.spanId = ctx.spanId;
  }
  cola.push(registro);
  if (cola.length >= 50) enviar();
}

setInterval(enviar, 2000).unref();

module.exports = { log, vaciar: enviar };
