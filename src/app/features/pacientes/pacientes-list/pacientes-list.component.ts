import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PacientesService } from '../pacientes.service';
import { Paciente } from '../../../models/paciente.model';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-pacientes-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pacientes-list.component.html',
})
export class PacientesListComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  carregando = signal(true);
  erro = signal(false);

  constructor(private svc: PacientesService, private toast: ToastService) {}

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.erro.set(false);
    this.svc.listar().subscribe({
      next: data => { this.pacientes.set(data); this.carregando.set(false); },
      error: ()   => { this.erro.set(true); this.carregando.set(false); },
    });
  }

  iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  remover(id: string) {
    if (!confirm('Remover paciente?')) return;
    this.svc.remover(id).subscribe(() => {
      this.pacientes.update(list => list.filter(p => p.id !== id));
      this.toast.success('Paciente removido.');
    });
  }
}
