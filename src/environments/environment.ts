// Aponta para localhost mesmo em producao: este front e uma ferramenta de
// demonstracao local do TCC (ver secao "Environments" no README).
export const environment = {
  production: true,
  apiUrl: 'http://localhost:3000',
  orchestratorUrl: 'http://localhost:3333',
  // Cada stack tem seu proprio Grafana, com dashboards e Prometheus separados
  grafanaUrl: 'http://localhost:3005',
  grafanaMsUrl: 'http://localhost:3008',
};
