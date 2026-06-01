
import { RolGlobal, RolEmpresa } from './types';

export interface IProfile {
  id: string;
  email?: string;
  rol?: string;
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