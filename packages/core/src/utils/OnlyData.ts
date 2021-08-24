// CREDITS: https://stackoverflow.com/a/55817647/13994294
// based on : https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type FilterFlags<Base, Condition> = { [Key in keyof Base]: Base[Key] extends Condition ? never : Key };
type AllowedNames<Base, Condition> = FilterFlags<Base, Condition>[keyof Base];
type SubType<Base, Condition> = Pick<Base, AllowedNames<Base, Condition>>;
export type OnlyData<T> = SubType<T, (_: any) => any>;
