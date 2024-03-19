"use strict";var typedoc=require("typedoc");exports.load=function(app){app.options.addDeclaration({name:"plugin-option",help:"Displayed when --help is passed",type:typedoc.ParameterType.String,defaultValue:""}),app.converter.on(typedoc.Converter.EVENT_RESOLVE,(context=>{app.options.getValue("plugin-option")}))};
//# sourceMappingURL=board.js.map
