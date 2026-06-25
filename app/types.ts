export interface Word {
  id: string;
  word: string;
  pos: string; // Part of speech, e.g., 'n.', 'v.', 'adj.'
}

export interface UserProgress {
  masteredIds: string[];
  starredIds: string[];
  notes: Record<string, string>; // Maps word ID to user notes/custom definitions
}
