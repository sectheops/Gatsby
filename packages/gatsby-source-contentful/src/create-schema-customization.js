// @ts-check
import _ from "lodash"
import { fetchContentTypes } from "./fetch"
import { createPluginConfig } from "./plugin-options"
import { CODES } from "./report"
import { resolveGatsbyImageData } from "./gatsby-plugin-image"
import { ImageCropFocusType, ImageResizingBehavior } from "./schemes"
import { stripIndent } from "common-tags"
import { addRemoteFilePolyfillInterface } from "gatsby-plugin-utils/polyfill-remote-file"

async function getContentTypesFromContentful({
  cache,
  reporter,
  pluginConfig,
}) {
  // Get content type items from Contentful
  const allContentTypeItems = await fetchContentTypes({
    pluginConfig,
    reporter,
  })

  const contentTypeFilter = pluginConfig.get(`contentTypeFilter`)

  const contentTypeItems = allContentTypeItems.filter(contentTypeFilter)

  if (contentTypeItems.length === 0) {
    reporter.panic({
      id: CODES.ContentTypesMissing,
      context: {
        sourceMessage: `Please check if your contentTypeFilter is configured properly. Content types were filtered down to none.`,
      },
    })
  }

  // Check for restricted content type names and set id based on useNameForId
  const useNameForId = pluginConfig.get(`useNameForId`)
  const restrictedContentTypes = [`entity`, `reference`, `asset`]

  if (pluginConfig.get(`enableTags`)) {
    restrictedContentTypes.push(`tag`)
  }

  contentTypeItems.forEach(contentTypeItem => {
    // Establish identifier for content type
    //  Use `name` if specified, otherwise, use internal id (usually a natural-language constant,
    //  but sometimes a base62 uuid generated by Contentful, hence the option)
    let contentTypeItemId = contentTypeItem.sys.id
    if (useNameForId) {
      contentTypeItemId = contentTypeItem.name.toLowerCase()
    }

    if (restrictedContentTypes.includes(contentTypeItemId)) {
      reporter.panic({
        id: CODES.FetchContentTypes,
        context: {
          sourceMessage: `Restricted ContentType name found. The name "${contentTypeItemId}" is not allowed.`,
        },
      })
    }
  })

  // Store processed content types in cache for sourceNodes
  const sourceId = `${pluginConfig.get(`spaceId`)}-${pluginConfig.get(
    `environment`
  )}`
  const CACHE_CONTENT_TYPES = `contentful-content-types-${sourceId}`
  await cache.set(CACHE_CONTENT_TYPES, contentTypeItems)

  return contentTypeItems
}

export async function createSchemaCustomization(
  { schema, actions, reporter, cache },
  pluginOptions
) {
  const { createTypes } = actions

  const pluginConfig = createPluginConfig(pluginOptions)

  let contentTypeItems
  if (process.env.GATSBY_WORKER_ID) {
    const sourceId = `${pluginConfig.get(`spaceId`)}-${pluginConfig.get(
      `environment`
    )}`
    contentTypeItems = await cache.get(`contentful-content-types-${sourceId}`)
  } else {
    contentTypeItems = await getContentTypesFromContentful({
      cache,
      reporter,
      pluginConfig,
    })
  }
  const { getGatsbyImageFieldConfig } = await import(
    `gatsby-plugin-image/graphql-utils`
  )

  const contentfulTypes = [
    schema.buildInterfaceType({
      name: `ContentfulEntry`,
      fields: {
        contentful_id: { type: `String!` },
        id: { type: `ID!` },
        node_locale: { type: `String!` },
      },
      extensions: { infer: false },
      interfaces: [`Node`],
    }),
    schema.buildInterfaceType({
      name: `ContentfulReference`,
      fields: {
        contentful_id: { type: `String!` },
        id: { type: `ID!` },
      },
      extensions: { infer: false },
    }),
  ]

  contentfulTypes.push(
    addRemoteFilePolyfillInterface(
      schema.buildObjectType({
        name: `ContentfulAsset`,
        fields: {
          contentful_id: { type: `String!` },
          id: { type: `ID!` },
          gatsbyImageData: getGatsbyImageFieldConfig(
            async (...args) => resolveGatsbyImageData(...args, { cache }),
            {
              jpegProgressive: {
                type: `Boolean`,
                defaultValue: true,
              },
              resizingBehavior: {
                type: ImageResizingBehavior,
              },
              cropFocus: {
                type: ImageCropFocusType,
              },
              cornerRadius: {
                type: `Int`,
                defaultValue: 0,
                description: stripIndent`
                 Desired corner radius in pixels. Results in an image with rounded corners.
                 Pass \`-1\` for a full circle/ellipse.`,
              },
              quality: {
                type: `Int`,
                defaultValue: 50,
              },
            }
          ),
          ...(pluginConfig.get(`downloadLocal`)
            ? {
                localFile: {
                  type: `File`,
                  extensions: {
                    link: {
                      from: `fields.localFile`,
                    },
                  },
                },
              }
            : {}),
        },
        interfaces: [`ContentfulReference`, `Node`, `RemoteFile`],
      }),
      {
        schema,
        actions,
      }
    )
  )

  // Create types for each content type
  contentTypeItems.forEach(contentTypeItem =>
    contentfulTypes.push(
      schema.buildObjectType({
        name: _.upperFirst(
          _.camelCase(
            `Contentful ${
              pluginConfig.get(`useNameForId`)
                ? contentTypeItem.name
                : contentTypeItem.sys.id
            }`
          )
        ),
        fields: {
          contentful_id: { type: `String!` },
          id: { type: `ID!` },
          node_locale: { type: `String!` },
        },
        interfaces: [`ContentfulReference`, `ContentfulEntry`, `Node`],
      })
    )
  )

  if (pluginConfig.get(`enableTags`)) {
    contentfulTypes.push(
      schema.buildObjectType({
        name: `ContentfulTag`,
        fields: {
          name: { type: `String!` },
          contentful_id: { type: `String!` },
          id: { type: `ID!` },
        },
        interfaces: [`Node`],
        extensions: { infer: false },
      })
    )
  }

  createTypes(contentfulTypes)
}
