import { stringify } from "query-string";
import { fetchUtils, DataProvider } from "ra-core";
import qs from "qs";

const POPULATE_ALL = "populate=*";

const OPERATORS = {
  _gte: "$gte",
  _lte: "$lte",
  _neq: "$ne",
  _q: "$contains",
};

/**
 * Turn Strapi arrays to React Admin arrays.
 * @param {Array} array Strapi resources / components arrays
 * @returns {Array} React Admin array of objects
 */
const strapiArrayToRa = (array: any) =>
  array[0]?.attributes
    ? array.map((object: any) => strapiObjectToRa(object))
    : array.map((object: any) => strapiAttributesToRa(object));

/**
 * Turn Strapi objects to React Admin objects.
 * @param {Object} object Strapi object
 * @returns {Object} React Admin objects
 */
const strapiObjectToRa = (object: any) => ({
  id: object.id,
  ...strapiAttributesToRa(object.attributes),
});

/**
 * Check the attribute type and turn in a React Admin
 * object property.
 * @param {Object} attributes Strapi data attributes
 * @returns {Object} React Admin object
 */
const strapiAttributesToRa = (attributes: any) => {
  let newAttributes: any = {};
  Object.keys(attributes).forEach((key: string) => {
    newAttributes[key] = attributes[key];
    if (Array.isArray(attributes[key])) {
      newAttributes[key] = strapiArrayToRa(attributes[key]);
    }
    if (
      Array.isArray(attributes[key]?.data) &&
      attributes[key]?.data[0]?.attributes?.mime
    ) {
      newAttributes[key] = attributes[key].data.map((image: any) => ({
        id: image.id,
        ...image.attributes,
      }));

      return;
    }
    if (
      Array.isArray(attributes[key]?.data) &&
      !attributes[key]?.data[0]?.attributes?.mime
    ) {
      newAttributes[key] = attributes[key].data.map((object: any) => object.id);
    }
    if (attributes[key]?.data?.id && !attributes[key]?.data?.attributes?.mime) {
      newAttributes[key] = attributes[key].data.id;
    }
    if (attributes[key]?.data === null) {
      newAttributes[key] = "";
    }
    if (attributes[key]?.id) {
      newAttributes[key] = strapiAttributesToRa(newAttributes[key]);
    }
    if (attributes[key]?.data?.attributes?.mime) {
      newAttributes[key] = strapiObjectToRa(newAttributes[key].data);
    }
  });

  return newAttributes;
};

/**
 * Turn empty string properties values in null.
 * @param {Object} object React Admin data object
 * @returns {Object} Strapi object
 */
const raEmptyAttributesToStrapi = (object: any) => {
  let newObject: any = {};
  let components: string[] = ["stages"];

  Object.keys(object).forEach((key) => {
    const newValue = object[key] === "" ? null : object[key];

    if (components.includes(key)) {
      newObject[key] = { data: newValue };
    } else {
      newObject[key] = newValue;
    }
  });

  return newObject;
};

/**
 * Turn React Admin filters in Strapi equivalent query object.
 * @param {Object} raFilter React Admin filters
 * @returns {Object} Equivalent filters to add in query string
 */
const raFilterToStrapi = (raFilter: any) => {
  if (!raFilter) return null;
  let filters: any = {};

  Object.keys(raFilter).forEach((key) => {
    if (typeof raFilter[key] === "object") {
      return (filters[key] = raFilterToStrapi(raFilter[key]));
    }

    // @ts-ignore
    const operator = OPERATORS[key.slice(-4)];
    if (key.slice(-2) === "_q") {
      const field = key.slice(0, -2);
      filters[field] = {
        $containsi: raFilter[key],
      };
    } else if (key === "id") {
      filters.id = {
        $in: raFilter.id,
      };
    } else if (operator) {
      const field = key.slice(0, -4);
      filters[field] = {
        [operator]: raFilter[key],
      };
    } else {
      filters[key] = {
        $eq: raFilter[key],
      };
    }
  });

  return filters;
};

/**
 * Turn React Admin params in Strapi equivalent request body.
 * @param {Object} params React Admin params
 * @returns {Object} Equivalent body to add in request body.
 */
const raToStrapiObj = (params: any) => {
  let body: any;

  const { data, multimedia } = separateMultimedia(params.data);

  if (multimedia) {
    const formData = new FormData();

    for (const key in multimedia) {
      if (Object.prototype.hasOwnProperty.call(multimedia, key)) {
        const element = multimedia[key];

        if (Array.isArray(element)) {
          let elementIds: any[] = [];
          element.forEach((f: any) => {
            f.rawFile instanceof File
              ? formData.append(`files.${key}`, f.rawFile, f.title)
              : elementIds.push(f.id);
          });

          data[key] = elementIds;
        }

        if (
          !Array.isArray(element) &&
          !(element.rawFile instanceof File) &&
          Object.prototype.hasOwnProperty.call(data, key)
        ) {
          data[key] = [element.id];
        }

        if (!Array.isArray(element) && element.rawFile instanceof File) {
          formData.append(`files.${key}`, element.rawFile, element.title);
        }
      }
    }

    formData.append("data", JSON.stringify(raEmptyAttributesToStrapi(data)));
    body = formData;
  }

  if (!multimedia) {
    body = JSON.stringify({ data: raEmptyAttributesToStrapi(data) });
  }

  return body;
};

/**
 * Separate an object in multimedia files and data
 * @param object React admin object
 * @returns
 */
const separateMultimedia = (object: { [key: string]: any }) => {
  let data: { [key: string]: any } = {};
  let multimedia: { [key: string]: any } | null = {};

  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const element = object[key];
      if (element?.rawFile) {
        multimedia = { ...multimedia, [key]: element };
      } else if (
        Array.isArray(element) &&
        (element[0]?.mime || element[0]?.rawFile)
      ) {
        multimedia = { ...multimedia, [key]: element };
      } else {
        data = { ...data, [key]: element };
      }
    }
  }

  if (Object.keys(multimedia).length === 0) {
    multimedia = null;
  }

  return { data, multimedia };
};

/**
 * Maps react-admin queries to a Strapi V4 REST API
 *
 * @example
 *
 * import * as React from "react";
 * import { Admin, Resource } from 'react-admin';
 * import { strapiRestProvider } from 'ra-strapi-v4-rest';
 *
 * import { PostList } from './posts';
 *
 * const App = () => (
 *     <Admin dataProvider={strapiRestProvider('http://path.to.my.api/')}>
 *         <Resource name="posts" list={PostList} />
 *     </Admin>
 * );
 *
 * export default App;
 */

export const strapiRestProvider = (
  apiUrl: string,
  httpClient = fetchUtils.fetchJson
): DataProvider => ({
  getList: (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;

    const query = {
      sort: [`${field}:${order}`],
      pagination: {
        page,
        pageSize: perPage,
      },
      filters: raFilterToStrapi(params.filter),
    };

    const queryStringify = qs.stringify(query, {
      encodeValuesOnly: true,
    });

    const url = `${apiUrl}/${resource}?${POPULATE_ALL}&${queryStringify}`;

    return httpClient(url, {}).then(({ json }) => ({
      data: strapiArrayToRa(json.data),
      total: json.meta.pagination.total,
    }));
  },

  getOne: (resource, params) =>
    httpClient(`${apiUrl}/${resource}/${params.id}?${POPULATE_ALL}`).then(
      ({ json }) => ({
        data: strapiObjectToRa(json.data),
      })
    ),

  getMany: (resource, params) => {
    const query = {
      filters: {
        id: {
          $in: params.ids,
        },
      },
    };
    const queryStringify = qs.stringify(query, {
      encodeValuesOnly: true,
    });
    const url = `${apiUrl}/${resource}?${queryStringify}`;

    return httpClient(url).then(({ json }) => ({
      data: strapiArrayToRa(json.data),
      total: json.meta.total,
    }));
  },

  getManyReference: (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;

    const query = {
      sort: [`${field}:${order}`],
      pagination: {
        page,
        pageSize: perPage,
      },
      filters: raFilterToStrapi({
        ...params.filter,
        [params.target.split(".").join("][")]: params.id,
      }),
    };

    const queryStringify = qs.stringify(query, {
      encodeValuesOnly: true,
    });
    const url = `${apiUrl}/${resource}?${POPULATE_ALL}&${queryStringify}`;
    
    return httpClient(url, {}).then(({ json }) => ({
      data: strapiArrayToRa(json.data),
      total: json.meta.pagination.total,
    }));
  },

  update: (resource, params) => {
    const body = raToStrapiObj(params);

    return httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: "PUT",
      body,
    }).then(({ json }) => ({ data: strapiObjectToRa(json.data) }));
  },

  updateMany: (resource, params) =>
    Promise.all(
      params.ids.map((id) =>
        httpClient(`${apiUrl}/${resource}/${id}`, {
          method: "PUT",
          body: JSON.stringify({ data: params.data }),
        })
      )
    ).then((responses) => ({
      data: responses.map(({ json }) => json.data.id),
    })),

  create: (resource, params) => {
    const body = raToStrapiObj(params);

    return httpClient(`${apiUrl}/${resource}`, {
      method: "POST",
      body,
    }).then(({ json }) => ({ data: strapiObjectToRa(json.data) }));
  },

  delete: (resource, params) =>
    httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: "DELETE",
      headers: new Headers({
        "Content-Type": "text/plain",
      }),
    }).then(({ json }) => ({ data: json })),

  deleteMany: (resource, params) =>
    Promise.all(
      params.ids.map((id) =>
        httpClient(`${apiUrl}/${resource}/${id}`, {
          method: "DELETE",
          headers: new Headers({
            "Content-Type": "text/plain",
          }),
        })
      )
    ).then((responses) => ({
      data: responses.map(({ json }) => json.data.id),
    })),
});
