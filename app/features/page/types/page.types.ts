export interface IPage {
  id: string;
  slugId?: string;
  title?: string;
  icon?: string;
  spaceId?: string;
  parentPageId?: string | null;
}
