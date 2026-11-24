const { metrics } = require('@opentelemetry/api');
const { log } = require('./logger');

const meter = metrics.getMeter('webapp-api');
const duracion = meter.createHistogram('app_request_duration_ms', {
  unit: 'ms',
  description: 'Latencia por endpoint',
});
const peticiones = meter.createCounter('app_requests_total', {
  description: 'Peticiones por endpoint',
});
const errores = meter.createCounter('app_request_errors_total', {
  description: 'Respuestas con error HTTP (4xx y 5xx)',
});

function metricsMiddleware(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const ruta = req.route ? req.baseUrl + req.route.path : 'no_encontrada';
    const attrs = {
      'http.method': req.method,
      'http.route': ruta,
      'http.status_code': res.statusCode,
    };
    duracion.record(ms, attrs);
    peticiones.add(1, attrs);
    if (res.statusCode >= 400) errores.add(1, attrs);

    const nivel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    log(nivel, `${req.method} ${req.originalUrl} -> ${res.statusCode}`, {
      ...attrs,
      'http.url': req.originalUrl,
      duracion_ms: Math.round(ms * 100) / 100,
    });
  });
  next();
}

module.exports = { metricsMiddleware };