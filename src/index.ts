import { Application, ParameterType, Converter, Context, DefaultThemeRenderContext, ProjectReflection, ReflectionKind, Reflection, Models, Renderer} from "typedoc";
import crypto from 'crypto';
import { writeFileSync, mkdirSync, readFileSync, existsSync, cpSync } from "node:fs";
import { resolve } from "node:path";

const reflectionKind = ReflectionKind;

export function load(app: Application) {
    app.options.addDeclaration({
        name: "l10nCode",
        help: "The language code for the generating translation json file",
        type: ParameterType.String,
        defaultValue: "en",
    });

    app.options.addDeclaration({
        name: "translationMode",
        help: "The translation mode for generating or injecting the translation jsons",
        type: ParameterType.String,
        defaultValue: "generate",
    });

    app.converter.on(Converter.EVENT_END, (context: Context) => {
        const l10nCode = app.options.getValue("l10nCode") as string;
        const mode = app.options.getValue("translationMode") as string;
        switch(mode){
        case "generate":
            app.logger.info(`Generating translation jsons for ${l10nCode}`);
            const res = generateTranslationJSON(l10nCode, context);
            const projectReflection = context.project;
            for(const key in res){
                const item = res[key];
                const path = item.projectPath;
                const obj = getByPath(projectReflection, path);
                if(obj === undefined){
                    app.logger.error(`Path not found: ${path}`);
                }
            }
            break;
        case "inject":
            app.logger.info(`Injecting translation for ${l10nCode}`);
            injectTranslation(l10nCode, context, app);
            break;
        case "default":
            app.logger.info("Stripping the translation tags");
            dfs(context.project, []);
            break;
        default:
            app.logger.info(`Generating translation jsons for ${l10nCode}`);
            generateTranslationJSON(l10nCode, context);
            break;
        }
    });

}

function injectTranslation(l10nCode: string, context: Context, app: Application){
    const curStagingTranslationFile = resolve(`./translations/staging/${l10nCode}`, "translation.json");
    const projectReflection = context.project;
    if(existsSync(curStagingTranslationFile)){
        const curStagingTranslation = JSON.parse(readFileSync(curStagingTranslationFile, "utf-8")) as TranslationTrimmed;
        const translationKeys = Object.keys(curStagingTranslation);
        for (const key of translationKeys){
            const curStagingItem = curStagingTranslation[key];
            if(curStagingItem.translation !== "" ){
                const item = getByPathShort(projectReflection, curStagingItem.projectPath);
                const finalPath = curStagingItem.projectPath[curStagingItem.projectPath.length - 1];
                if (item !== undefined){
                    const originalText = getByPath(projectReflection, curStagingItem.projectPath);
                    if(originalText !== undefined && curStagingItem.originalText == originalText){
                        item[finalPath] = curStagingItem.translation;
                    }
                } else {
                    app.logger.warn(`Path not found: ${curStagingItem.projectPath}`);
                    app.logger.warn("The original documentation probably has changed since the translation was generated. Please regenerate the translation file.")
                }
            }
        }
    } else {
        app.logger.error(`Translation file not found: ${curStagingTranslationFile}`);
        return;
    }
    app.logger.info("No Discrepency found in the translation file. Injecting the translation to the documentation");
}

function generateTranslationJSON(l10nCode: string, context: Context){
    const curStagingTranslationFile = resolve(`./translations/staging/${l10nCode}`, "translation.json");
    const curProdTranslationFile = resolve(`./translations/prod/${l10nCode}`, "translation.json");
    const curStagingReadMEFile = resolve(`./translations/staging/${l10nCode}`, "README.md");
    const curProdReadMEFile = resolve(`./translations/prod/${l10nCode}`, "README.md");
    const projectReflection = context.project;
    const res = dfs(projectReflection, []);
    const trimmedDownData = {} as TranslationTrimmed;
    if(existsSync(curProdTranslationFile)){
        const curProdTranslation = JSON.parse(readFileSync(curProdTranslationFile, "utf-8")) as TranslationTrimmed;
        const translationKeys = Object.keys(curProdTranslation);
        for (const key of translationKeys){
            const curProdItem = curProdTranslation[key];
            if(curProdItem.translation !== "" && curProdItem.translationKey in res && res[curProdItem.translationKey].originalText == curProdItem.originalText){
                res[curProdItem.translationKey].translation = curProdItem.translation;
            }
        }
    }
    if(existsSync(curStagingTranslationFile)){
        const curStagingTranslation = JSON.parse(readFileSync(curStagingTranslationFile, "utf-8")) as TranslationTrimmed;
        const translationKeys = Object.keys(curStagingTranslation);
        for (const key of translationKeys){
            const curStagingItem = curStagingTranslation[key];
            if(curStagingItem.translation !== "" && curStagingItem.translationKey in res && res[curStagingItem.translationKey].originalText == curStagingItem.originalText){
                res[curStagingItem.translationKey].translation = curStagingItem.translation;
            }
        }
    }
    for(const translationKey in res){
        const item = res[translationKey];
        const trimmedItem: TranslationItemTrimmed = {
            humanReadablePath: item.humanReadablePath,
            kind: item.kind,
            originalText: item.originalText,
            translation: item.translation,
            projectPath: item.projectPath,
            translationKey: item.translationKey,
        };
        trimmedDownData[translationKey] = trimmedItem;
    }
    mkdirSync(`./translations/staging/${l10nCode}`, {recursive: true});
    if(!existsSync(curStagingReadMEFile)){
        if(existsSync(curProdReadMEFile)){
            cpSync(curProdReadMEFile, curStagingReadMEFile);
        } else {
            cpSync(resolve(`./`, "README.md"), curStagingReadMEFile);
        }
    }
    writeFileSync(resolve(`./translations/staging/${l10nCode}`, "translation.json"), JSON.stringify(trimmedDownData, null, 2));
    return res;
}

type TranslationItem = {
    originalText: string;
    translation: string;
    flatPath: string[];
    projectPath: string[];
    locationIdentifier: string;
    translationKey: string;
    humanReadablePath?: string;
    kind: string;
}

type TranslationItemTrimmed = {
    originalText: string;
    translation: string;
    projectPath: string[];
    translationKey: string;
    humanReadablePath?: string;
    kind: string;
}

type Translation = {
    [key: string]: TranslationItem;
}

type TranslationTrimmed = {
    [key: string]: TranslationItemTrimmed;
}

export function reflectionMapping(node: Reflection){
    if(node.kind == undefined){
        return "unknown";
    }
    switch(node.kind){
    case reflectionKind.Project:
        return "project";
    case reflectionKind.Module:
        return "module";
    case reflectionKind.Namespace:
        return "namespace";
    case reflectionKind.Enum:
        return "enum";
    case reflectionKind.EnumMember:
        return "enumMember";
    case reflectionKind.Variable:
        return "variable";
    case reflectionKind.Function:
        return "function";
    case reflectionKind.Class:
        return "class";
    case reflectionKind.Interface:
        return "interface";
    case reflectionKind.Constructor:
        return "constructor";
    case reflectionKind.Property:
        return "property";
    case reflectionKind.Method:
        return "method";
    case reflectionKind.CallSignature:
        return "callSignature";
    case reflectionKind.IndexSignature:
        return "indexSignature";
    case reflectionKind.ConstructorSignature:
        return "constructorSignature";
    case reflectionKind.Parameter:
        return "parameter";
    case reflectionKind.TypeLiteral:
        return "typeLiteral";
    case reflectionKind.TypeParameter:
        return "typeParameter";
    case reflectionKind.Accessor:
        return "accessor";
    case reflectionKind.GetSignature:
        return "getSignature";
    case reflectionKind.SetSignature:
        return "setSignature";
    case reflectionKind.TypeAlias:
        return "typeAlias";
    case reflectionKind.Reference:
        return "reference";
    default:
        return "unknown";
    }
}

export function getCategoryStrings(node: ProjectReflection, path: string[] = [], humanReadablePath: string[] = []){
    if (node.categories !== undefined){
        return node.categories.map((category, index) => {
            const flatPath = [`${node.id}`, `categories`, `index-${index}`];
            const projectPath = [...path, "categories", `index-${index}`, "title"];
            const translationKey = crypto.createHash('md5').update(`${projectPath.join("")}${category.title}${"category"}`).digest('hex');
            const locationIdentifier = crypto.createHash('md5').update(`${flatPath.join("")}${category.title}${"category"}`).digest('hex');
            const nextLevelHumanReadablePath = [...humanReadablePath, `categories`, `index-${index}`, "title"];
            const item = { translationKey: translationKey, flatPath: flatPath, projectPath: projectPath, originalText: category.title, translation: "", kind: "category", locationIdentifier: locationIdentifier, humanReadablePath: nextLevelHumanReadablePath.join(" > ")};
            return item;
        });
    }
    return undefined;
}

type TranslationNode = {
    [key: string]: Reflection;
}

function dfs(node: Reflection, path: string[] = [], humanReadablePath: string[] = []){
    const res: Translation = {};
    if((node.flags && "isExternal" in node.flags && node.flags.isExternal)){
        return res;
    }
    if("categories" in node && node.categories !== undefined){
        const categories = getCategoryStrings(node as ProjectReflection, path, humanReadablePath);
        if(categories !== undefined){
            categories.forEach((category)=>{
                res[category.translationKey] = category;
            });
        }
    }
    if(node.comment !== undefined){
        const translations = parseTranslationComment(node, path, humanReadablePath);
        const translationBlocks = parseTranslationBlockComment(node, path, humanReadablePath);
        translations.forEach((translation)=>{
            res[translation.translationKey] = translation;
        });
        translationBlocks.forEach((translation)=>{
            res[translation.translationKey] = translation;
        });
    }
    if("children" in node){
        const children = node.children as Reflection[];
        children.forEach((child, index)=>{
            const localRes = dfs(child, [...path, "children", `index-${index}`], [...humanReadablePath, child.name]);
            const translationKeys = Object.keys(localRes);
            for (const key of translationKeys){
                res[key] = localRes[key];
            }
        });
    }
    if("signatures" in node){
        const signatures = node.signatures as Reflection[];
        signatures.forEach((signature, index)=>{
            const localRes = dfs(signature, [...path, "signatures", `index-${index}`], [...humanReadablePath, signature.name]);
            const translationKeys = Object.keys(localRes);
            for (const key of translationKeys){
                res[key] = localRes[key];
            }
        });
    }
    if("getSignature" in node){
        const accessorComment = parseAccessorComment(node.getSignature as Reflection, path, node, humanReadablePath);
        accessorComment.forEach((translationItem)=>{
            res[translationItem.translationKey] = translationItem;
        });
        const getSignature = node.getSignature as Reflection;
        const localRes = dfs(getSignature, [...path, `getSignature`], [...humanReadablePath, getSignature.name]);
        const translationKeys = Object.keys(localRes);
        for (const key of translationKeys){
            res[key] = localRes[key];
        }
    }
    if("setSignature" in node){
        const accessorComment = parseAccessorComment(node.setSignature as Reflection, path, node, humanReadablePath);
        accessorComment.forEach((translationItem)=>{
            res[translationItem.translationKey] = translationItem;
        });
        const setSignature = node.setSignature as Reflection;
        const localRes = dfs(setSignature, [...path, `setSignature`], [...humanReadablePath, setSignature.name]);
        const translationKeys = Object.keys(localRes);
        for (const key of translationKeys){
            res[key] = localRes[key];
        }
    }
    return res;
}

function parseAccessorComment(node: Reflection, path: string[], parentNode: Reflection, humanReadablePath: string[] = []){
    const translationItems: TranslationItem[] = [];
    if (node.comment !== undefined){
        if(parentNode.comment == undefined){
            parentNode.comment = new Models.Comment();
        }
        node.comment.getTags("@accessorDescription").forEach((comment)=>{
            comment.content.forEach((content, index)=>{
                if(content.kind !== "text"){
                    return;
                }
                const item: TranslationItem = {
                        originalText: content.text,
                        translation: "",
                        flatPath: [],
                        projectPath: [],
                        locationIdentifier: "",
                        translationKey: "",
                        kind: ""
                    };
                item.originalText = content.text;
                item.translation = "";
                item.flatPath = [];
                item.flatPath.push(`${node.id}`);
                item.flatPath.push(`${node.name}`);
                item.flatPath.push("comments");
                item.flatPath.push(`index-${index}`);
                const insertAtSummary = parentNode.comment.summary.length;
                item.projectPath = [...path, "comment", "summary",`index-${insertAtSummary}`, "text"];
                parentNode.comment.summary.push({...content});
                item.kind = reflectionMapping(parentNode);
                const locationIdentifier = crypto.createHash('md5').update(`${item.flatPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.translationKey = crypto.createHash('md5').update(`${item.projectPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.locationIdentifier = locationIdentifier;
                item.humanReadablePath = [...humanReadablePath, "accessor comments", `index-${index}`, "text"].join(" > ");
                translationItems.push(item);
            });
        });
        node.comment.removeTags("@accessorDescription");
    }
    return translationItems;
}

function parseTranslationComment(node: Reflection, path: string[], humanReadablePath: string[] = []){
    const translationItems: TranslationItem[] = [];
    if (node.comment !== undefined){
        node.comment.getTags("@translation").forEach((comment)=>{
            comment.content.forEach((content, index)=>{
                if(content.kind !== "text"){
                    return;
                }
                const item: TranslationItem = {
                        originalText: content.text,
                        translation: "",
                        flatPath: [],
                        projectPath: [],
                        locationIdentifier: "",
                        translationKey: "",
                        kind: ""
                    };
                item.originalText = content.text;
                item.translation = "";
                item.flatPath = [];
                item.flatPath.push(`${node.id}`);
                item.flatPath.push(`${node.name}`);
                item.flatPath.push("comments");
                item.flatPath.push(`index-${index}`);
                const insertAtSummary = node.comment.summary.length;
                item.projectPath = [...path, "comment", "summary",`index-${insertAtSummary}`, "text"];
                node.comment.summary.push({...content});
                item.kind = reflectionMapping(node);
                const locationIdentifier = crypto.createHash('md5').update(`${item.flatPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.translationKey = crypto.createHash('md5').update(`${item.projectPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.locationIdentifier = locationIdentifier;
                item.humanReadablePath = [...humanReadablePath, "translation comments", `index-${index}`, "text"].join(" > ");
                translationItems.push(item);
            });
        });
        node.comment.removeTags("@translation");
    }
    return translationItems;
}

function parseTranslationBlockComment(node: Reflection, path: string[], humanReadablePath: string[] = []){
    const translationItems: TranslationItem[] = [];
    if (node.comment !== undefined){
        node.comment.blockTags.forEach((comment, blockIndex)=>{
            if(comment.tag !== "@translationBlock"){
                return;
            }
            comment.content.forEach((content, index)=>{
                if(content.kind !== "text"){
                    return;
                }
                const item: TranslationItem = {
                    originalText: content.text,
                    translation: "",
                    flatPath: [],
                    projectPath: [],
                    locationIdentifier: "",
                    translationKey: "",
                    kind: ""
                };
                item.originalText = content.text;
                item.translation = "";
                item.flatPath = [];
                item.flatPath.push(`${node.id}`);
                item.flatPath.push(`${node.name}`);
                item.flatPath.push("comments");
                item.flatPath.push(`index-${index}`);
                item.projectPath = [...path, "comment", "blockTags",`index-${blockIndex}`, "content", `index-${index}`, "text"];
                // const insertAtSummary = node.comment.summary.length;
                // node.comment.summary.push(content);
                item.kind = reflectionMapping(node);
                const locationIdentifier = crypto.createHash('md5').update(`${item.flatPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.translationKey = crypto.createHash('md5').update(`${item.projectPath.join("")}${item.originalText}${item.kind}`).digest('hex');
                item.locationIdentifier = locationIdentifier;
                item.humanReadablePath = [...humanReadablePath, "translation block comments", `index-${index}`, "text"].join(" > ");
                translationItems.push(item);
            });
        });
    }
    return translationItems;
}

function reflectionClassMapping(reflection: Reflection){
    switch(reflection.constructor.name){
    case "ProjectReflection":
        return "project";
    case "ContainerReflection":
        return "container";
    case "DeclarationReflection":
        return "declaration";
    case "ParameterReflection":
        return "parameter";
    case "ReferenceReflection":
        return "reference";
    case "TypeParameterReflection":
        return "typeParameter";
    case "SignatureReflection":
        return "signature";
    default:
        return "reflection";
    }
}

export function getByPathShort(root: any, path: string[]){
    let obj = root;
    for(let index = 0; index < path.length - 1; index++){
        if(obj === undefined){
            console.error("Path not found", path);
            return undefined;
        }
        if(path[index].length >= 5 && path[index].substring(0, 5) === "index"){
            const indexInPath = parseInt(path[index].substring(6));
            obj = obj[indexInPath];
            continue;
        }
        if(path[index] in obj){
            const propertyName = path[index];
            obj = obj[propertyName];
        }
    }
    return obj;
}

export function getByPath(root: any, path: string[]){
    let obj = root;
    for(let index = 0; index < path.length; index++){
        if(obj === undefined){
            console.error("Path not found", path);
            return undefined;
        }
        if(path[index].length >= 5 && path[index].substring(0, 5) === "index"){
            const indexInPath = parseInt(path[index].substring(6));
            obj = obj[indexInPath];
            continue;
        }
        obj = obj[path[index]];
    }
    return obj;
}
