import {
  Entity,
  PrimaryColumn,
  Column,
  JoinColumn,
  OneToMany,
  ManyToOne
} from 'typeorm';

import {User} from '../user/model';
import {UserGroupRole} from '../../binding'

export const UserGroupRoleOptions: Record<UserGroupRole, UserGroupRole> = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  PRINCIPAL_INVESTIGATOR: 'PRINCIPAL_INVESTIGATOR'
};

@Entity()
export class Group {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', name: 'short_name' })
  shortName: string;

  @Column({ type: 'text', name: 'url_slug', nullable: true })
  urlSlug: string | null;

  @OneToMany(type => UserGroup, userGroup => userGroup.group)
  members: UserGroup[];
}

@Entity('user_group')
export class UserGroup {

  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId: string;

  @ManyToOne(type => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'text', name: 'group_id' })
  groupId: string;

  @ManyToOne(type => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ type: 'text', enum: ['INVITED'] })
  role: 'INVITED' |
    'PENDING' |
    'MEMBER' |
    'PRINCIPAL_INVESTIGATOR';

  @Column({ default: true })
  primary: boolean;
}