import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { PacientesService } from '../pacientes.service';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-paciente-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './paciente-form.component.html',
})
export class PacienteFormComponent implements OnInit {
  editando = signal(false);
  private id?: string;
  private fb      = inject(FormBuilder);
  private svc     = inject(PacientesService);
  private toast   = inject(ToastService);
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);

  form = this.fb.group({
    nomeCompleto:      ['', Validators.required],
    sexo:              ['', Validators.required],
    cpf:               ['', Validators.required],
    dataNascimento:    ['', Validators.required],
    telefoneContato:   [''],
    tipagemSanguinea:  [''],
    consentimentoLgpd: [false, Validators.requiredTrue],
  });

  ngOnInit() {
    this.id = this.route.snapshot.params['id'];
    if (this.id) {
      this.editando.set(true);
      this.form.get('cpf')!.disable();
      this.form.get('consentimentoLgpd')!.disable();
      this.svc.buscar(this.id).subscribe(p => this.form.patchValue(p));
    }
  }

  salvar() {
    if (this.form.invalid) return;
    const dto = this.form.getRawValue() as any;
    const req = this.editando()
      ? this.svc.atualizar(this.id!, dto)
      : this.svc.criar(dto);
    req.subscribe(() => {
      this.toast.success(this.editando() ? 'Paciente atualizado!' : 'Paciente cadastrado!');
      this.router.navigate(['/pacientes']);
    });
  }
}
