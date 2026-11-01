export type AgeGroup = '3-4' | '4-5' | '5-6';
export type Gender = 'girl' | 'boy' | 'other';

export interface ChildProfileRecord {
  id: string;
  displayId: string;
  nickname: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  ageGroup: AgeGroup | null;
  avatarId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChildProfileInput {
  nickname: string;
  gender: Gender | null;
  ageGroup: AgeGroup;
  avatarId: string | null;
}
