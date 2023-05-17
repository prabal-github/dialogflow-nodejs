import { OpenAI } from "langchain/llms/openai";
import { RetrievalQAChain } from "langchain/chains";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import alogoliaSearchIndex from "./library/algolia.js";
import shopifyClient from "./library/shopify.js";
import nodemailer from 'nodemailer'
import { convert } from "html-to-text";

import express from 'express'
import cors from 'cors'
import * as dotenv from "dotenv";
dotenv.config();
import helmet from 'helmet'
import compression from "compression";
import bunyan from 'bunyan'
const log = bunyan.createLogger({ name: "development", level: 'debug' });

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(compression());

const PORT = process.env.PORT

const options = {
  wordwrap: 130,
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "itsprabalchowdhury@gmail.com",
    pass: "uqcvavgdluhugtty",
  },
});

const model = new OpenAI({ temperature: 0.1 });
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

app.post('/', async (req, res) => {
  let response = {}
  if (req.body.pageInfo.displayName === 'RaiseQuery') {
    response = await raiseQuery(req.body.sessionInfo.parameters.username, req.body.sessionInfo.parameters.useremail, req.body.sessionInfo.parameters.userquery)
  }
  else if (req.body.pageInfo.displayName === 'BulkOrder') {
    response = await bulkOrder(req.body.sessionInfo.parameters.username, req.body.sessionInfo.parameters.useremail, req.body.sessionInfo.parameters.productname, req.body.sessionInfo.parameters.quantity)
  }
  else if (req.body.pageInfo.displayName === 'Product') {
    if (req.body.fulfillmentInfo.tag !== 'optionsAPI') {
      response = await productInfo(req.body.sessionInfo.parameters.productname, req.body.sessionInfo.parameters.productquery, req.body.sessionInfo.parameters.productoption)
    }
    else {
      response = await productOptions(req.body.sessionInfo.parameters.productname)
      response = { text: JSON.stringify(Object.assign({}, response)) }
    }
  } else if (req.body.pageInfo.displayName === 'OrderStatus') {
    const str = req.body.sessionInfo.session;
    const n = str.lastIndexOf('/');
    const result = str.substring(n + 1);
    const res = await getCustomer(result)
    response = { text: 'result' }
  }
  const jsonResponse = {
    fulfillment_response: {
      messages: [
        {
          text: {
            text: [response ? response.text : "No response!"]
          }
        }
      ]
    }
  };
  res.json(jsonResponse)
})

const getData = async (body) => {
  const docs = await textSplitter.createDocuments([body.text]);
  const vectorStore = await HNSWLib.fromDocuments(docs, new OpenAIEmbeddings());
  const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());
  const res = await chain.call({
    query: body.question,
  });
  return res;
};

const productInfo = async (productName, productQuery, productOption) => {
  const { hits } = await alogoliaSearchIndex.search(productName)
  if (hits.length > 0) {
    const shopifyData = await getStaticPropsContentShopify(hits[productOption].store.gid, 'en')
    const text = convert(shopifyData.description, options);
    let data = {}
    if (productQuery === 'benefits') {
      data = {
        question: `What are the benefits OF ${productName}?`,
        text: text
      }
    } else if (productQuery === 'ingredients') {
      data = {
        question: `What are the ingredients OF ${productName}?`,
        text: text
      }
    }
    const res = {}
    try {
      res = await getData(data)
    } catch (error) {
      log.fatal(error)
    }

    if (!res) {
      return "Data not found!"
    }
    else {
      return res
    }
  }
}

const productOptions = async (productName) => {
  let { hits } = await alogoliaSearchIndex.search(productName)
  if (hits.length <= 5) {
    const res = []
    hits.map((hit) => {
      res.push(hit.store.title)
    })
    return res
  } else if (hits.length > 5) {
    const res = []
    hits = hits.slice(0, 5)
    hits.map((hit) => {
      res.push(hit.store.title)
    })
    return res
  } else if (hits.length === 0) {
    return "Product not found!"
  }
}

const bulkOrder = async (name, email, productname, quantity) => {
  const response = await transporter.sendMail({
    from: '"Prabal Ayurheals 👻" <itsprabalchowdhury@gmail.com>',
    to: email,
    subject: "Bulk Order ✔",
    text: "Bulk Order details",
    html: `<b>Hello ${name}!</b> Your bulk order details for the product name <i>${productname}</i>. and quantity <i>${quantity}</i> has been sent and we will contack you ASAP!`,
  })
  if (response) {
    return {
      text: `Your bulk order request for the product name ${productname} and quantity ${quantity} has been sent and we will get back to you ASAP!`
    }
  } else {
    return {
      text: "Something went wrong!"
    }
  }
}

const raiseQuery = async (name, email, query) => {
  const response = await transporter.sendMail({
    from: '"Prabal Ayurheals 👻" <itsprabalchowdhury@gmail.com>',
    to: email,
    subject: "Hello ✔",
    text: "Hello world?",
    html: `<b>Hello ${name}!</b> Your query is <i>${query}</i>. Sorry for the inconvenience, we will get back to you ASAP!`,
  })
  if (response) {
    return {
      text: "Your query has been sent and we will get back to you ASAP!"
    }
  } else {
    return {
      text: "Something went wrong!"
    }
  }
}

async function getStaticPropsContentShopify(productId, locale) {
  const query = `
      query ($locale: LanguageCode, $productId: ID!)
      @inContext(language: $locale) {
        product(id: $productId) {
          id
          title
          vendor
          descriptionHtml
          seo {
            title
            description
          }
          featuredImage {
            url
          }
          priceRange {
            maxVariantPrice {
              currencyCode
              amount
            }
          }
          compareAtPriceRange {
            maxVariantPrice {
              currencyCode
              amount
            }
          }
          images(first: 250) {
            edges {
              node {
                id
                url
              }
            }
          }
          options {
            id
            name
            values
          }
        }
        productRecommendations(productId: $productId) {
          id
          title
          vendor
          featuredImage {
            url
          }
          priceRange {
            minVariantPrice {
              currencyCode
              amount
            }
            maxVariantPrice {
              currencyCode
              amount
            }
          }
          compareAtPriceRange {
            minVariantPrice {
              currencyCode
              amount
            }
            maxVariantPrice {
              currencyCode
              amount
            }
          }
          handle
        }
      }
    `

  const variables = {
    locale: locale.toUpperCase(),
    productId: productId,
  }
  const response = await shopifyClient.request(query, variables)
  const response2 = await shopifyClient.request(
    `
        query ($productId: ID!) @inContext(language: EN) {
          product(id: $productId) {
            options {
              id
              name
              values
            }
          }
        }
      `,
    {
      productId: productId,
    }
  )

  const data = {
    seo: {
      metaTitle: response.product.seo.title,
      metaDescription: response.product.seo.description,
    },
    featuredImage: response.product.featuredImage?.url || null,
    compareAtPrice: response.product.compareAtPriceRange.maxVariantPrice,
    price: response.product.priceRange.maxVariantPrice,
    offer: Math.floor(
      ((response.product.compareAtPriceRange.maxVariantPrice.amount -
        response.product.priceRange.maxVariantPrice.amount) /
        response.product.compareAtPriceRange.maxVariantPrice.amount) *
      100
    ),
    images: response.product.images.edges.map((image) => ({
      id: image.node.id,
      url: image.node.url,
      alt: response.product.title,
    })),
    productRecommendations: response.productRecommendations,
    title: response.product.title,
    vendor: response.product.vendor,
    description: response.product.descriptionHtml
      ? response.product.descriptionHtml
      : null,

    options: response2.product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values,
    })),
  }

  return data
}

export async function getCustomer(customerAccessToken) {
  const CUSTOMER_QUERY = `#graphql
  query ($customerAccessToken: String!) {
    customer(customerAccessToken: $customerAccessToken) {
      firstName
      lastName
      phone
      email
      acceptsMarketing
      defaultAddress {
        id
        formatted
        firstName
        lastName
        company
        address1
        address2
        country
        province
        city
        zip
        phone
      }
      addresses(first: 6) {
        edges {
          node {
            id
            formatted
            firstName
            lastName
            company
            address1
            address2
            country
            province
            city
            zip
            phone
          }
        }
      }
      orders(first: 250, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            id
            orderNumber
            processedAt
            financialStatus
            fulfillmentStatus
            statusUrl
            successfulFulfillments {
              trackingCompany
              trackingInfo {
                url
                number
              }
            }
            currentTotalPrice {
              amount
              currencyCode
            }
            lineItems(first: 250) {
              edges {
                node {
                  currentQuantity
                  title
                  variant {
                    product {
                      handle
                    }
                    title
                    image {
                      url
                      altText
                      height
                      width
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

  const variables = {
    customerAccessToken
  }

  const data = await shopifyClient.request(CUSTOMER_QUERY, variables)

  return data;
}

app.listen(PORT, () => log.info(`Server listening at port http://localhost:${PORT}`));
