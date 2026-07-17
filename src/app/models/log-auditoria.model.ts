export interface LogAuditoria {
  id: string;
  atendimentoId?: string;
  acaoRealizada: string;
  dataHora: string;
  ipOrigem?: string;
  entidadeAfetada: string;
  entidadeId: string;
  usuarioResponsavel?: string;
}
