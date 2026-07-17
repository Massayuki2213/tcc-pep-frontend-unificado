import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MedicosService } from '../medicos.service';
import { Medico } from '../../../models/medico.model';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-medicos-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './medicos-list.component.html',
})
export class MedicosListComponent implements OnInit {
  medicos = signal<Medico[]>([]);
  carregando = signal(true);
  erro = signal(false);

  private svc   = inject(MedicosService);
  private toast = inject(ToastService);

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.erro.set(false);
    this.svc.listar().subscribe({
      next: data => { this.medicos.set(data); this.carregando.set(false); },
      error: ()   => { this.erro.set(true); this.carregando.set(false); },
    });
  }

  remover(id: string) {
    if (!confirm('Remover médico?')) return;
    this.svc.remover(id).subscribe(() => {
      this.medicos.update(list => list.filter(m => m.id !== id));
      this.toast.success('Médico removido.');
    });
  }
}
