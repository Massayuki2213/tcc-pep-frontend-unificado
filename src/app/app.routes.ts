import { Routes } from '@angular/router';

export const routes: Routes = [
  // Dashboard (visão geral)
  { path: '', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },

  // Médicos
  { path: 'medicos', loadComponent: () => import('./features/medicos/medicos-list/medicos-list.component').then(m => m.MedicosListComponent) },
  { path: 'medicos/novo', loadComponent: () => import('./features/medicos/medico-form/medico-form.component').then(m => m.MedicoFormComponent) },
  { path: 'medicos/:id/editar', loadComponent: () => import('./features/medicos/medico-form/medico-form.component').then(m => m.MedicoFormComponent) },

  // Pacientes
  { path: 'pacientes', loadComponent: () => import('./features/pacientes/pacientes-list/pacientes-list.component').then(m => m.PacientesListComponent) },
  { path: 'pacientes/novo', loadComponent: () => import('./features/pacientes/paciente-form/paciente-form.component').then(m => m.PacienteFormComponent) },
  { path: 'pacientes/:id', loadComponent: () => import('./features/pacientes/prontuario/prontuario.component').then(m => m.ProntuarioComponent) },
  { path: 'pacientes/:id/editar', loadComponent: () => import('./features/pacientes/paciente-form/paciente-form.component').then(m => m.PacienteFormComponent) },

  // Atendimentos
  { path: 'atendimentos', loadComponent: () => import('./features/atendimentos/atendimentos-list/atendimentos-list.component').then(m => m.AtendimentosListComponent) },
  { path: 'atendimentos/novo', loadComponent: () => import('./features/atendimentos/triagem-form/triagem-form.component').then(m => m.TriagemFormComponent) },
  { path: 'atendimentos/:id', loadComponent: () => import('./features/atendimentos/atendimento-detail/atendimento-detail.component').then(m => m.AtendimentoDetailComponent) },

  // Consultas / Laudos
  { path: 'consultas-laudos/novo', loadComponent: () => import('./features/consultas-laudos/consulta-form/consulta-form.component').then(m => m.ConsultaFormComponent) },

  // Logs de Auditoria
  { path: 'logs-auditoria', loadComponent: () => import('./features/logs-auditoria/logs-auditoria-list/logs-auditoria-list.component').then(m => m.LogsAuditoriaListComponent) },

  // Benchmark (dispara k6 via orquestrador + dashboards Grafana)
  { path: 'benchmark', loadComponent: () => import('./features/benchmark/benchmark.component').then(m => m.BenchmarkComponent) },

  // Laboratório (acervo das rodadas para o teste t e a ANOVA)
  { path: 'laboratorio', loadComponent: () => import('./features/laboratorio/laboratorio.component').then(m => m.LaboratorioComponent) },

  // Resultados (teste t, ANOVA e Tukey sobre o acervo)
  { path: 'resultados', loadComponent: () => import('./features/resultados/resultados.component').then(m => m.ResultadosComponent) },

  { path: '**', redirectTo: '' },
];
