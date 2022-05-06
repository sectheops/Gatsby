const { Transformer } = require('@parcel/plugin')
const babel = require(`@babel/core`)
const babelPluginRemoveGraphqlQueries = require('babel-plugin-remove-graphql-queries')

module.exports = new Transformer({
  async transform({asset}) {
    let code = await asset.getCode()
    
    const { code: transformed } = babel.transform(code, {
      presets: [
        `@babel/preset-react`,
        `@babel/preset-typescript`,
      ],
      plugins: [babelPluginRemoveGraphqlQueries],
      filename: asset.filePath,
    })

    asset.setCode(transformed)
    return [asset]
  }
})