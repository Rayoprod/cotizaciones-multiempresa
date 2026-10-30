import { RolGlobal, RolEmpresa } from './types';

export interface IProfile {
  id: string;
  email?: string;
  /** Lo que imprime el PDF como vendedor. */
  nombre?: string | null;
  rol?: RolGlobal;
  activo?: boolean;
  created_at?: string;
}
export interface IUsuarioEmpresa {
  id?: string;
  usuario_id: string;
  empresa_id: string;
  rol: RolEmpresa;
  activo?: boolean;
  created_at?: string;
}

/** Una empresa asignada a una cuenta, con el rol que tiene ahí. */
export type IAsignacionEmpresa = Pick<IUsuarioEmpresa, 'empresa_id' | 'rol'>;
