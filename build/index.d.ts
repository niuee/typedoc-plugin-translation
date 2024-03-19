import { Application, ProjectReflection, Reflection } from "typedoc";
export declare function load(app: Application): void;
export declare function reflectionMapping(node: Reflection): "project" | "reference" | "unknown" | "module" | "namespace" | "enum" | "enumMember" | "variable" | "function" | "class" | "interface" | "constructor" | "property" | "method" | "callSignature" | "indexSignature" | "constructorSignature" | "parameter" | "typeLiteral" | "typeParameter" | "accessor" | "getSignature" | "setSignature" | "typeAlias";
export declare function getCategoryStrings(node: ProjectReflection, path?: string[], humanReadablePath?: string[]): {
    translationKey: string;
    flatPath: string[];
    projectPath: string[];
    originalText: string;
    translation: string;
    kind: string;
    locationIdentifier: string;
    humanReadablePath: string;
}[];
export declare function getByPathShort(root: any, path: string[]): any;
export declare function getByPath(root: any, path: string[]): any;
