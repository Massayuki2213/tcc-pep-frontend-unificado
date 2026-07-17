import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LogsAuditoriaService } from '../logs-auditoria.service';
import { LogAuditoria } from '../../../models/log-auditoria.model';

const LIMITE_EXIBICAO = 200;

@Component({
  selector: 'app-logs-auditoria-list',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './logs-auditoria-list.component.html',
})
export class LogsAuditoriaListComponent implements OnInit {
  logs = signal<LogAuditoria[]>([]);
  total = signal(0);
  carregando = signal(true);
  limite = LIMITE_EXIBICAO;

  constructor(private svc: LogsAuditoriaService) {}

  ngOnInit() {
    this.svc.listar().subscribe({
      next: data => {
        this.total.set(data.length);
        // Mais recentes primeiro; limitado para não travar o navegador com dezenas de milhares de linhas
        const ordenados = [...data].sort((a, b) => b.dataHora.localeCompare(a.dataHora));
        this.logs.set(ordenados.slice(0, LIMITE_EXIBICAO));
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
