import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  Badge,
  InlineStack,
  TextField,
  Select,
  ButtonGroup,
  Divider,
  Tabs,  
  Frame,
  Box,
  Grid,
  InlineGrid,
  Layout
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Fixed: Properly construct the endpoint URL
const getEndpoint = () => {
  const baseUrl = process.env.AI_DESCRIBER_ENDPOINT;
  if (!baseUrl) {
    console.error('AI_DESCRIBER_ENDPOINT environment variable is not set');
    return null;
  }
  
  // Ensure proper URL construction
  const endpoint = `${baseUrl.replace(/\/$/, '')}/contents`;
  console.log('API Endpoint:', endpoint);
  return endpoint;
};

const ENDPOINT = getEndpoint();

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // Check if endpoint is available
  if (!ENDPOINT) {
    console.error('API endpoint is not configured');
    return {
      items: [],
      totalItems: 0,
      productCount: 0,
      collectionCount: 0,
      modifiedCount: 0,
      error: 'API endpoint not configured'
    };
  }
  
  const fetchPaginated = async (query, dataPath) => {
    let items = [];
    let hasNextPage = true;
    let afterCursor = null;

    while (hasNextPage) {
      try {
        const response = await admin.graphql(query, {
          variables: { first: 100, after: afterCursor }
        });
        const json = await response.json();
        
        if (json.errors) {
          console.error('GraphQL errors:', json.errors);
          throw new Error(`GraphQL error: ${json.errors[0]?.message || 'Unknown error'}`);
        }
        
        const edges = json.data[dataPath].edges;
        items = [...items, ...edges.map(edge => edge.node)];
        hasNextPage = json.data[dataPath].pageInfo.hasNextPage;
        afterCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
      } catch (error) {
        console.error(`Error fetching ${dataPath}:`, error);
        break;
      }
    }
    return items;
  };

  // Fetch all products - Using template literals instead of gql
  const productQuery = `
    query getProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            handle
            status
            description
            descriptionHtml
            seo {
              title
              description
            }
            updatedAt
            featuredImage {
              url
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  // Fetch all collections - Using template literals instead of gql
  const collectionQuery = `
    query getCollections($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            handle
            description
            descriptionHtml
            seo {
              title
              description
            }
            updatedAt
            image {
              url
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  let products = [];
  let collections = [];
  
  try {
    [products, collections] = await Promise.all([
      fetchPaginated(productQuery, 'products'),
      fetchPaginated(collectionQuery, 'collections')
    ]);
  } catch (error) {
    console.error('Error fetching Shopify data:', error);
    return {
      items: [],
      totalItems: 0,
      productCount: 0,
      collectionCount: 0,
      modifiedCount: 0,
      error: 'Failed to fetch Shopify data'
    };
  }

  // Fixed: Improved API call with better error handling
  const fetchOriginalContentForItems = async () => {
    if (!ENDPOINT) {
      console.error('Endpoint not available for fetching original contents');
      return [];
    }

    try {
      console.log('Fetching from endpoint:', ENDPOINT);
      
      const response = await fetch(ENDPOINT, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Add any additional headers if required by your API
          // "Authorization": "Bearer your-token-here",
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000) // 30 seconds timeout
      });
      
      console.log('API Response status:', response.status);
      console.log('API Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error(`API request failed with status: ${response.status}`);
        console.error('Response text:', await response.text());
        return [];
      }
      
      const data = await response.json();
      console.log('API Response data:', data);
      
      // Handle different response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data && typeof data === 'object') {
        // If the response is an object with a data property
        if (data.data && Array.isArray(data.data)) {
          return data.data;
        }
        // If the response is a single object, wrap it in an array
        return [data];
      }
      
      return [];
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.error('API request timed out');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error - check if the API server is running:', error.message);
      } else {
        console.error('Failed to fetch original contents:', error);
      }
      return [];
    }
  };

  const originalContents = await fetchOriginalContentForItems();
  console.log('Original contents loaded:', originalContents.length);

  // Helper function to check if content has been reverted
  const isContentReverted = (current, original) => {
    if (!current || !original) return false;
    const currentClean = current.replace(/<[^>]*>/g, '').trim().toLowerCase();
    const originalClean = original.replace(/<[^>]*>/g, '').trim().toLowerCase();
    return currentClean === originalClean;
  };

  const allItems = [
    ...products.map(product => {
      const originalContent = originalContents.find(oc => oc.originId === product.id && oc.contentType === 'description');
      const originalseoContent = originalContents.find(oc => oc.originId === product.id && oc.contentType === 'seo-description');
      
      // Only include items that have at least one type of AI-generated content
      if (!originalContent && !originalseoContent) return null;

      // Check if description was AI-generated and if it's been reverted
      const hasAiDescription = !!originalContent;
      const isDescriptionReverted = hasAiDescription ? isContentReverted(
        product.descriptionHtml,
        originalContent?.originalContentHtml || originalContent?.originalContent
      ) : false;

      // Check if SEO was AI-generated and if it's been reverted
      const hasAiSeo = !!originalseoContent;
      const isSeoReverted = hasAiSeo ? isContentReverted(
        product.seo?.description || "",
        originalseoContent?.originalContent || ""
      ) : false;

      return {
        id: product.id,
        title: product.title,
        type: 'product',
        status: product.status,
        currentDescription: product.description,
        currentDescriptionHtml: product.descriptionHtml,
        currentSeoTitle: product.seo?.title,
        currentSeoDescription: product.seo?.description || "",
        
        // AI generation flags
        hasAiDescription,
        hasAiSeo,
        
        // Original content (only if AI-generated)
        originalDescription: hasAiDescription ? (originalContent?.originalContentHtml || originalContent?.originalContent) : null,
        originalSeoDescription: hasAiSeo ? originalseoContent?.originalContent : null,
        
        hasOriginalContent: hasAiDescription || hasAiSeo,
        updatedAt: product.updatedAt,
        image: product.featuredImage?.url,
        isDescriptionReverted,
        isSeoReverted,
      };
    }).filter(Boolean),
    ...collections.map(collection => {
      const originalContent = originalContents.find(oc => oc.originId === collection.id && oc.contentType === 'description');
      const originalseoContent = originalContents.find(oc => oc.originId === collection.id && oc.contentType === 'seo-description');

      // Only include items that have at least one type of AI-generated content
      if (!originalContent && !originalseoContent) return null;

      // Check if description was AI-generated and if it's been reverted
      const hasAiDescription = !!originalContent;
      const isDescriptionReverted = hasAiDescription ? isContentReverted(
        collection.descriptionHtml, 
        originalContent?.originalContentHtml || originalContent?.originalContent
      ) : false;
      
      // Check if SEO was AI-generated and if it's been reverted
      const hasAiSeo = !!originalseoContent;
      const isSeoReverted = hasAiSeo ? isContentReverted(
        collection.seo?.description || "", 
        originalseoContent?.originalContent || ""
      ) : false;

      return {
        id: collection.id,
        title: collection.title,
        type: 'collection',
        status: 'active',
        currentDescription: collection.description,
        currentDescriptionHtml: collection.descriptionHtml,
        currentSeoTitle: collection.seo?.title,
        currentSeoDescription: collection.seo?.description || "",
        
        // AI generation flags
        hasAiDescription,
        hasAiSeo,
        
        // Original content (only if AI-generated)
        originalDescription: hasAiDescription ? (originalContent?.originalContentHtml || originalContent?.originalContent) : null,
        originalSeoDescription: hasAiSeo ? originalseoContent?.originalContent : null,
        
        hasOriginalContent: hasAiDescription || hasAiSeo,
        updatedAt: collection.updatedAt,
        image: collection.image?.url,
        isDescriptionReverted,
        isSeoReverted,
      };
    }).filter(Boolean)
  ];

  return {
    items: allItems,
    totalItems: allItems.length,
    productCount: products.filter(p => {
      return originalContents.some(oc => oc.originId === p.id);
    }).length,
    collectionCount: collections.filter(c => {
      return originalContents.some(oc => oc.originId === c.id);
    }).length,
    modifiedCount: allItems.length,
    endpoint: ENDPOINT, // Return the endpoint for debugging
    originalContentsCount: originalContents.length // Return count for debugging
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const body = await request.json();
    const { action, itemId, itemType, originalContent, contentType } = body;

    if (action !== "revert" || !itemId || !itemType || !originalContent) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid request parameters - missing originalContent"
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let response;
    let mutation;
    
    if (itemType === "product") {
      if (contentType === "description") {
        mutation = `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
                description
                descriptionHtml
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        response = await admin.graphql(mutation, {
          variables: {
            input: {
              id: itemId,
              descriptionHtml: originalContent,
            },
          },
        });
      } else if (contentType === "seo") {
        mutation = `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
                seo {
                  title
                  description
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        response = await admin.graphql(mutation, {
          variables: {
            input: {
              id: itemId,
              seo: {
                description: originalContent,
              },
            },
          },
        });
      }
    } else if (itemType === "collection") {
      if (contentType === "description") {
        mutation = `
          mutation collectionUpdate($input: CollectionInput!) {
            collectionUpdate(input: $input) {
              collection {
                id
                title
                description
                descriptionHtml
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        response = await admin.graphql(mutation, {
          variables: {
            input: {
              id: itemId,
              descriptionHtml: originalContent,
            },
          },
        });
      } else if (contentType === "seo") {
        mutation = `
          mutation collectionUpdate($input: CollectionInput!) {
            collectionUpdate(input: $input) {
              collection {
                id
                title
                seo {
                  title
                  description
                }
              }
            }
          }
        `;
        
        response = await admin.graphql(mutation, {
          variables: {
            input: {
              id: itemId,
              seo: {
                description: originalContent,
              },
            },
          },
        });
      }
    }

    const responseJson = await response.json();
    const updateKey = itemType === "product" ? "productUpdate" : "collectionUpdate";
    
    if (responseJson.data[updateKey].userErrors.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        errors: responseJson.data[updateKey].userErrors,
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      item: {
        id: itemId,
        type: itemType,
        contentType: contentType,
        originalContent: originalContent,
      },
      message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} ${contentType} reverted successfully to original content.`,
    }), { 
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("Revert Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};


const SidebarSkeleton = () => (
  <div style={{ flex: "0 0 320px", maxWidth: "400px", position: "sticky", top: "20px", alignSelf: "flex-start" }}>
    <Card title="Quick Generator" sectioned>
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          height: "16px",
          width: "80px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "8px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "36px",
          width: "100%",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
      </div>
      
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          height: "16px",
          width: "90px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "8px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "36px",
          width: "100%",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
      </div>
      
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          height: "16px",
          width: "100px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "8px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "36px",
          width: "100%",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "12px",
          width: "200px",
          backgroundColor: "#f9fafb",
          borderRadius: "3px",
          marginTop: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
      </div>
      
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          height: "16px",
          width: "110px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "8px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "36px",
          width: "100%",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "12px",
          width: "250px",
          backgroundColor: "#f9fafb",
          borderRadius: "3px",
          marginTop: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
      </div>
      
      <div style={{
        height: "44px",
        width: "100%",
        backgroundColor: "#e0e7ff",
        borderRadius: "6px",
        animation: "shimmer 2s ease-in-out infinite",
      }} />
    </Card>
  </div>
);

const EmptyStateSkeleton = () => (
  <Layout.Section>
    <Card>
      <div style={{
        textAlign: "center",
        padding: "60px 40px",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        borderRadius: "12px",
        border: "2px dashed #e2e8f0"
      }}>
        <div style={{
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          backgroundColor: "#e0e7ff",
          margin: "0 auto 24px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        
        <div style={{
          height: "24px",
          width: "300px",
          backgroundColor: "#f3f4f6",
          borderRadius: "6px",
          margin: "0 auto 16px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        <div style={{
          height: "18px",
          width: "450px",
          backgroundColor: "#f9fafb",
          borderRadius: "4px",
          margin: "0 auto 8px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        
        <div style={{
          height: "18px",
          width: "380px",
          backgroundColor: "#f9fafb",
          borderRadius: "4px",
          margin: "0 auto 32px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
        
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "24px",
          marginTop: "40px",
          maxWidth: "600px",
          margin: "40px auto 0"
        }}>
          {[1, 2, 3, 4].map((index) => (
            <div key={index} style={{
              padding: "24px",
              background: "white",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{
                width: "32px",
                height: "32px",
                backgroundColor: "#f3f4f6",
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
              <div style={{
                height: "20px",
                width: "120px",
                backgroundColor: "#f3f4f6",
                borderRadius: "4px",
                margin: "0 auto 8px",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
              <div style={{
                height: "14px",
                width: "140px",
                backgroundColor: "#f9fafb",
                borderRadius: "3px",
                margin: "0 auto",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
            </div>
          ))}
        </div>
        
        <div style={{
          marginTop: "40px",
          padding: "20px",
          background: "rgba(99, 102, 241, 0.1)",
          borderRadius: "8px",
          border: "1px solid rgba(99, 102, 241, 0.2)"
        }}>
          <div style={{
            height: "16px",
            width: "300px",
            backgroundColor: "rgba(99, 102, 241, 0.2)",
            borderRadius: "4px",
            margin: "0 auto",
            animation: "shimmer 2s ease-in-out infinite",
          }} />
        </div>
      </div>
    </Card>
  </Layout.Section>
);

const LoadingSkeleton = () => (
  <Frame>
    <Page title="Content Generator">
      <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
        <SidebarSkeleton />
        <div style={{ flex: "1 1 0", minWidth: "0" }}>
          <Layout>
            <EmptyStateSkeleton />
          </Layout>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shimmer {
            0% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
            100% {
              opacity: 1;
            }
          }
        `
      }} />
    </Page>
  </Frame>
);


 
export default function ContentDashboard() {


  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  // Show skeleton while loading
  if (isLoading) {
    return <LoadingSkeleton />;
  }


  const loaderData = useLoaderData();
  const [items, setItems] = useState(loaderData.items);
  const { totalItems, productCount, collectionCount, modifiedCount } = loaderData;
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reverting, setReverting] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const appData = [
    {
      title: "QBoost: Upsell & Cross Sell",
      description:
        "Maximize your store's potential with seamless upsell features that drive extra revenue.",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/0560/1535/6003/files/QuickBoostLogo.png?v=1742299521",
      imageAlt: "QBoost",
      appUrl: "https://apps.shopify.com/qboost-upsell-cross-sell",
    },
    {
      title: "ScriptInjector",
      description:
        "Effortlessly insert custom scripts into your store for enhanced tracking and functionality.",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/0560/1535/6003/files/ScriptInjectorLogo.png?v=1742298347",
      imageAlt: "Script Injector",
      appUrl: "https://apps.shopify.com/scriptinjectorapp",
    },
    {
      title: "FileMaster ‑ Files Exporter",
      description:
        "Easily manage & download all your store files in just one click.",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/0560/1535/6003/files/FilemasterLogo.png?v=1742298178",
      imageAlt: "FileMaster",
      appUrl: "https://apps.shopify.com/filemaster-exporter",
    },
    {
      title: "IceMajesty",
      description: "Snowy magic: Transform with enchanting snow effects!",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/0560/1535/6003/files/IceMajestyLogo.png?v=1742479358",
      imageAlt: "IceMajesty",
      appUrl: "https://apps.shopify.com/icemajesty-1",
    },

  ];
     const [showAll, setShowAll] = useState(false);
    const displayedApps = showAll ? appData : appData.slice(0, 4);
  
   const [isRecommendedAppsLoading, setIsRecommendedAppsLoading] = useState(true);
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      setReverting(null);
      
      // Update the item state without reloading
      const { item } = fetcher.data;
      setItems(prevItems => 
        prevItems.map(prevItem => {
          if (prevItem.id === item.id) {
            return {
              ...prevItem,
              [`is${item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1)}Reverted`]: true,
              [`current${item.contentType === 'description' ? 'DescriptionHtml' : 'SeoDescription'}`]: item.originalContent,
            };
          }
          return prevItem;
        })
      );
    } else if (fetcher.data?.success === false) {
      const errorMessage = fetcher.data.errors?.[0]?.message || fetcher.data.error || "An error occurred";
      shopify.toast.show("Error: " + errorMessage, {
        isError: true,
      });
      setReverting(null);
    }
  }, [fetcher.data, shopify]);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchValue.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "reverted" && (item.isDescriptionReverted || item.isSeoReverted)) ||
      (statusFilter === "ai-active" && !item.isDescriptionReverted && !item.isSeoReverted);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const toggleExpanded = (itemId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };
   const handleGenerate = () => {
    navigate("/app/generate_contnet");
  };


  const handleRevertDescription = async (item) => {
    if (item.isDescriptionReverted) {
      shopify.toast.show("Description has already been reverted to original content", { 
        isError: false,
        duration: 3000 
      });
      return;
    }

    if (!item.hasAiDescription || !item.originalDescription) {
      shopify.toast.show("No original description available to revert", { isError: true });
      return;
    }

    setReverting(`${item.id}-description`);

    fetcher.submit(
      {
        action: "revert",
        itemId: item.id,
        itemType: item.type,
        originalContent: item.originalDescription,
        contentType: "description",
      },
      { method: "POST", encType: "application/json" }
    );
  };

  const handleRevertSeo = async (item) => {
    if (item.isSeoReverted) {
      shopify.toast.show("SEO description has already been reverted to original content", { 
        isError: false,
        duration: 3000 
      });
      return;
    }

    if (!item.hasAiSeo || !item.originalSeoDescription) {
      shopify.toast.show("No original SEO description available to revert", { isError: true });
      return;
    }

    setReverting(`${item.id}-seo`);

    fetcher.submit(
      {
        action: "revert",
        itemId: item.id,
        itemType: item.type,
        originalContent: item.originalSeoDescription,
        contentType: "seo",
      },
      { method: "POST", encType: "application/json" }
    );
  };

  const getTypeBadge = (type) => {
    return type === 'product' ? 
      <Badge status="info" size="small">Product</Badge> : 
      <Badge status="attention" size="small">Collection</Badge>;
  };

  // Enhanced ScrollableContent component with better HTML handling
  const ScrollableContent = ({ content, maxHeight = "150px", isReverted = false }) => {
    if (!content) return <Text variant="bodySm" tone="subdued">No content available</Text>;
    
    // Function to convert plain text to proper HTML formatting
    const convertToHtmlFormat = (text) => {
      // Check if content already has HTML tags
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(text);
      
      if (hasHtmlTags) {
        return text; // Already HTML formatted
      }
      
      let formattedContent = text

        .replace(/\r?\n/g, '<br>')
        // Convert double line breaks to paragraphs
        .replace(/(<br>\s*){2,}/g, '</p><p>')
        // Add opening and closing paragraph tags
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, '')
        .replace(/<p>\s*<br>\s*<\/p>/g, '<p></p>')
        // Handle bold text patterns
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Handle italic text patterns
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        // Handle bullet points
        .replace(/^\s*[-•*]\s+(.+)$/gm, '<li>$1</li>')
        // Wrap consecutive list items in ul tags
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        // Handle numbered lists
        .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
        // Clean up any remaining line breaks inside paragraphs
        .replace(/<p>([^<]*)<br>([^<]*)<\/p>/g, '<p>$1 $2</p>');
      
      return formattedContent;
    };
  
    return (
      <div style={{
        maxHeight,
        overflowY: "auto",
        padding: "12px",
        border: "1px solid #e1e3e5",
        borderRadius: "8px",
        backgroundColor: isReverted ? "#f0f9ff" : "#fafbfb",
        fontSize: "14px",
        lineHeight: "1.6"
      }}>
        <div 
          dangerouslySetInnerHTML={{ __html: convertToHtmlFormat(content) }} 
          style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
            color: "#202223"
          }}
        />
        
        {/* Inline styles for better HTML formatting */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .content-display p {
              margin: 0 0 12px 0 !important;
              line-height: 1.6 !important;
            }
            .content-display p:last-child {
              margin-bottom: 0 !important;
            }
            .content-display ul {
              margin: 8px 0 !important;
              padding-left: 20px !important;
            }
            .content-display ol {
              margin: 8px 0 !important;
              padding-left: 20px !important;
            }
            .content-display li {
              margin-bottom: 4px !important;
              line-height: 1.5 !important;
            }
            .content-display strong {
              font-weight: 600 !important;
              color: #000 !important;
            }
            .content-display em {
              font-style: italic !important;
              color: #666 !important;
            }
            .content-display br {
              line-height: 1.8 !important;
            }
          `
        }} />
      </div>
    );
  };

  // Component to display "Not AI-generated" message
  const NotAiGeneratedMessage = ({ contentType }) => (
    <div style={{
   textAlign: 'center',
    padding: '48px 24px',
    backgroundColor: '#f9fafb',
    border: '2px dashed #d1d5db',
    borderRadius: '24px'
    }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🚫</div>
      <Text variant="bodyMd" tone="subdued">
        This {contentType} has not been AI-generated.
      </Text>
      <Text variant="bodySm" tone="subdued" style={{ marginTop: "8px" }}>
        Only generated content can be reverted to original versions.
      </Text>
      <div                    style={{
    marginTop: '24px'
 
    }}>
       <Button 
                  variant="secondary"
                  onClick={handleGenerate}

                >
                  Generate Content
                </Button>
    </div>
        </div>
  );

  const ContentComparison = ({ item }) => {
    const [selectedTab, setSelectedTab] = useState(0);
    
    const tabs = [
      {
        id: 'description',
        content: 'Description',
        panelID: 'description-panel',
      },
      {
        id: 'seo',
        content: 'SEO Description',
        panelID: 'seo-panel',
      },
    ];

    return (

      <div style={{ marginTop: "16px" }}>
       

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} >
          <Divider style={{ display: 'none' }} />

      {selectedTab === 0 && (
            <div style={{ 
              marginTop: '24px',
              backgroundColor: '#fafbfc',
              borderRadius: '8px',
              padding: '24px'
            }}>
              {item.hasAiDescription ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px'
                }}>
                  {/* Original Description */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>📝</span>
                        <Text variant="headingXs" as="h4" tone="subdued">
                          Original Description
                        </Text>
                      </div>
                      <Button 
                        size="micro" 
                        onClick={() => handleRevertDescription(item)}
                        loading={reverting === `${item.id}-description`}
                        tone={item.isDescriptionReverted ? "success" : "critical"}
                        disabled={!item.originalDescription}
                      >
                        {item.isDescriptionReverted ? "✅ Reverted" : "Revert Changes"}
                      </Button>
                    </div>
                    <div style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      border: '2px solid #dbeafe',
                      borderRadius: '12px',
                      minHeight: '140px',
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '-1px',
                        left: '-1px',
                        right: '-1px',
                        height: '4px',
                        background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                        borderRadius: '12px 12px 0 0'
                      }}></div>
                      <ScrollableContent content={item.originalDescription} />
                    </div>
                  </div>
                  
                  {/* Current Description */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>
                          {item.isDescriptionReverted ? '🔄' : '✨'}
                        </span>
                        <Text variant="headingXs" as="h4" tone="subdued">
                          {item.isDescriptionReverted ? "Current (Reverted)" : "Current (AI Enhanced)"}
                        </Text>
                      </div>
                    </div>
                    <div style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      border: `2px solid ${item.isDescriptionReverted ? '#dbeafe' : '#fed7aa'}`,
                      borderRadius: '12px',
                      minHeight: '140px',
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '-1px',
                        left: '-1px',
                        right: '-1px',
                        height: '4px',
                        background: item.isDescriptionReverted 
                          ? 'linear-gradient(90deg, #3b82f6, #06b6d4)'
                          : 'linear-gradient(90deg, #f59e0b, #f97316)',
                        borderRadius: '12px 12px 0 0'
                      }}></div>
                      <ScrollableContent 
                        content={item.isDescriptionReverted ? item.originalDescription : item.currentDescriptionHtml} 
                        isReverted={item.isDescriptionReverted} 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <NotAiGeneratedMessage contentType="description" />
              )}
            </div>
          )}
        {selectedTab === 1 && (
            <div style={{ 
              marginTop: '24px',
              backgroundColor: '#fafbfc',
              borderRadius: '8px',
              padding: '24px'
            }}>
              {item.hasAiSeo ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px'
                }}>
                  {/* Original SEO */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🔍</span>
                        <Text variant="headingXs" as="h4" tone="subdued">
                          Original SEO Description
                        </Text>
                      </div>
                      <Button 
                        size="micro" 
                        onClick={() => handleRevertSeo(item)}
                        loading={reverting === `${item.id}-seo`}
                        tone={item.isSeoReverted ? "success" : "critical"}
                        disabled={!item.originalSeoDescription}
                      >
                        {item.isSeoReverted ? "✅ Reverted" : "Revert Changes"}
                      </Button>
                    </div>
                    <div style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      border: '2px solid #dbeafe',
                      borderRadius: '12px',
                      minHeight: '140px',
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '-1px',
                        left: '-1px',
                        right: '-1px',
                        height: '4px',
                        background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                        borderRadius: '12px 12px 0 0'
                      }}></div>
                      {item.originalSeoDescription ? (
                        <ScrollableContent 
                          content={item.originalSeoDescription} 
                          maxHeight="100px" 
                        />
                      ) : (
                        <Text variant="bodySm" tone="subdued" style={{ fontStyle: 'italic' }}>
                          No original SEO description was available
                        </Text>
                      )}
                    </div>
                  </div>
                  
                  {/* Current SEO */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>
                          {item.isSeoReverted ? '🔄' : '✨'}
                        </span>
                        <Text variant="headingXs" as="h4" tone="subdued">
                          {item.isSeoReverted ? "Current SEO (Reverted)" : "Current SEO (AI Enhanced)"}
                        </Text>
                      </div>
                    </div>
                    <div style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      border: `2px solid ${item.isSeoReverted ? '#dbeafe' : '#fed7aa'}`,
                      borderRadius: '12px',
                      minHeight: '140px',
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '-1px',
                        left: '-1px',
                        right: '-1px',
                        height: '4px',
                        background: item.isSeoReverted 
                          ? 'linear-gradient(90deg, #3b82f6, #06b6d4)'
                          : 'linear-gradient(90deg, #f59e0b, #f97316)',
                        borderRadius: '12px 12px 0 0'
                      }}></div>
                      {(() => {
                        if (item.isSeoReverted) {
                          return item.originalSeoDescription ? (
                            <ScrollableContent 
                              content={item.originalSeoDescription}
                              maxHeight="100px" 
                              isReverted={true}
                            />
                          ) : (
                            <Text variant="bodySm" tone="subdued" style={{ fontStyle: 'italic' }}>
                              No original SEO description to revert to
                            </Text>
                          );
                        } else {
                          return item.currentSeoDescription ? (
                            <ScrollableContent 
                              content={item.currentSeoDescription}
                              maxHeight="100px" 
                              isReverted={false}
                            />
                          ) : (
                            <Text variant="bodySm" tone="subdued" style={{ fontStyle: 'italic' }}>
                              No generated SEO description available
                            </Text>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <NotAiGeneratedMessage contentType="SEO description" />
              )}
            </div>
          )}
        </Tabs>

      </div>
    );
  };

  const ItemCard = ({ item }) => {
    const isExpanded = expandedItems.has(item.id);
    
    return (
      <Card>
        <div style={{ padding: "20px", }}>
          <InlineStack gap="400" align="space-between">
            <InlineStack gap="300" align="cente" style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'ceter'}}>
              <div style={{ 
                width: "60px", 
                height: "60px", 
                borderRadius: "12px", 
                overflow: "hidden",
                border: "2px solid #f1f2f4",
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
            
              }}>
                {item.image ? (
                  <img 
                    src={item.image} 
                    alt={item.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                    color: "#8c9196"
                  }}>
                    {item.type === 'product' ? '📦' : '📁'}
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" align="start">
        <h3 style={{
              margin: '0 0 2px 0',
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',

            }}>
                      {item.title}
     </h3>
      
                  
                  </InlineStack>
                    <span style={{
                fontSize: '13px',
                color: '#6b7280',
                borderRadius: '20px',
                fontWeight: '500'}}>   {getTypeBadge(item.type)}</span>
                </BlockStack>
              </div>
            </InlineStack>
            
            <div style={{ flexShrink: 0 }}>
              <ButtonGroup>
                <Button 
                  size="medium" 
                  onClick={() => toggleExpanded(item.id)}
                >
                  {isExpanded ? "Hide Details" : "View Details"}
                </Button>
              </ButtonGroup>
            </div>
          </InlineStack>

          {isExpanded && (
            <>
            
              <ContentComparison item={item} />
            </>
          )}
        </div>
      </Card>
    );
  };

  const typeOptions = [
    { label: "All Types", value: "all" },
    { label: "Products", value: "product" },
    { label: "Collections", value: "collection" },
  ];
  return (
    <Page>
      <TitleBar title="📝 AI-Modified Content Dashboard" />
      
      <BlockStack gap="600">
        {/* Enhanced Stats Section */}
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "32px",
          color: "#000000"
        }}>
          <BlockStack gap="400">
<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  }}
>
  <div>
    <Text
      variant="headingLg"
      as="h2"
      style={{ color: "white", marginBottom: "8px" }}
    >
      Content Generator Dashboard
    </Text>
    <Text variant="bodyMd" style={{ color: "rgba(255,255,255,0.9)" }}>
      Manage and revert your generated content across products and collections.
    </Text>
  </div>

  <Button
    onClick={handleGenerate}
    style={{
      background: "linear-gradient(135deg,rgb(181, 194, 209),rgb(186, 202, 218))", 
      color: "white",
      fontWeight: "600",
      padding: "10px 22px",
      borderRadius: "8px",
      border: "none",
      boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
      transition: "all 0.3s ease",
      cursor: "pointer",
    }}
  >
    Generate Content
  </Button>
</div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "24px",
              marginTop: "24px",
            }}>
              {[
                { label: "Modified Items", value: totalItems, icon: "🤖", color: "#7dd3fc" },
                { label: "Generated products contents", value: productCount, icon: "📦", color: "#a5b4fc" },
                { label: "Generated collections contents", value: collectionCount, icon: "🗂️", color: "#fbcfe8" },
              ].map((stat, index) => (
                <div 
                  key={index} 
                  style={{
                    padding: "20px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: `2px solid ${stat.color}`,
                    boxShadow: `0 4px 20px ${stat.color}55`,
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-5px)";
                    e.currentTarget.style.boxShadow = `0 6px 25px ${stat.color}88`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = `0 4px 20px ${stat.color}55`;
                  }}
                >
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>{stat.icon}</div>
                  <Text variant="headingXl" as="h3" style={{ color: "white", marginBottom: "4px" }}>
                    {stat.value}
                  </Text>
                  <Text variant="bodySm" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {stat.label}
                  </Text>
                </div>
              ))}
            </div>
          </BlockStack>
        </div>

        {totalItems === 0 && (
          <Card>
            <div style={{ textAlign: "center", padding: "80px 40px" }}>
              <div style={{
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                fontSize: "40px",
                marginBottom: "24px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>🤖</div>
              <Text variant="headingLg" as="h3" style={{ marginBottom: "16px" }}>
                No AI-Modified Content Found
              </Text>
              <Text variant="bodyMd" tone="subdued" style={{ marginBottom: "32px" }}>
                No products or collections have been modified with generated content yet.
              </Text>
            </div>
          </Card>
        )}

        {/* Enhanced Filters */}
        {totalItems > 0 && (
          <Card
            sectioned
            style={{
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
              background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ padding: "24px" }}>
              <BlockStack gap="400">
                <Text
                  variant="headingMd"
                  as="h3"
                  style={{
                    marginBottom: "12px",
                    fontWeight: "600",
                    color: "white",
                  }}
                >
                  Filter & Search Modified Items
                </Text>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    gap: "20px",
                    alignItems: "end",
                  }}
                >
                  <TextField
                    label="Search"
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search by product or collection name..."
                    clearButton
                    onClearButtonClick={() => setSearchValue("")}
                    prefix="🔍"
                  />

                  <Select
                    label="Type"
                    options={typeOptions}
                    value={typeFilter}
                    onChange={setTypeFilter}
                  />
                </div>
              </BlockStack>
            </div>
          </Card>
        )}

        {filteredItems.length > 0 ? (
          <BlockStack gap="300">
            {filteredItems.map(item => (
              <ItemCard key={item.id} item={item} />
            ))}
          </BlockStack>
        ) : totalItems > 0 ? (
          <Card>
            <div style={{ textAlign: "center", padding: "80px 40px" }}>
              <div style={{ fontSize: "64px", marginBottom: "24px" }}>🔍</div>
              <Text variant="headingLg" as="h3" style={{ marginBottom: "16px" }}>
                No items found matching your filters
              </Text>
              <Text variant="bodyMd" tone="subdued" style={{ marginBottom: "32px" }}>
                Try adjusting your search terms or filters to find what you're looking for.
              </Text>
              <Button onClick={() => {
                setSearchValue("");
                setTypeFilter("all");
                setStatusFilter("all");
              }}>
                Clear All Filters
              </Button>
            </div>
          </Card>
        ) : null}
      </BlockStack>
       <Layout.Section>
          <Box paddingBlockEnd="500">
           
              <Card>
      <div style={{ margin: "15px 5px" }}>
  <InlineGrid columns={{ xs: "1fr auto" }} gap="400" align="center">
    <Text variant="headingMd" as="h2">
      Recommended apps
    </Text>
    <Button
      url="https://apps.shopify.com/partners/gaurang2"
      target="_blank"
      primary
    >
      Show More
    </Button>
  </InlineGrid>
</div>

 
                <Grid>
                  {displayedApps.map((app, index) => (
                    <Grid.Cell
                      key={index}
                      columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}
                    >
                      <Card title="Sales" sectioned>
                        <InlineStack wrap={false} gap="400">
                          <Box>
                            <img
                              src={app.imageUrl}
                              alt={app.imageAlt}
                              style={{
                                width: "5rem",
                                height: "5rem",
                                borderRadius: "10px",
                              }}
                            />
                          </Box>
                          <BlockStack inlineAlign="start" gap="100">
                            <Text variant="headingMd" as="h2">
                              <div>{app.title}</div>
                            </Text>
                            <Text variant="bodyMd" as="p">
                              <div style={{ marginBottom: "5px" }}>
                                {app.description}
                              </div>
                            </Text>
                            <Button
                              url={app.appUrl}
                              external={true}
                              target="_blank"
                              fullWidth={false}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                Install Now
                              </div>
                            </Button>
                          </BlockStack>
                        </InlineStack>
                      </Card>
                    </Grid.Cell>
                  ))}
                </Grid>
              </Card>
           
          </Box>
        </Layout.Section>
    </Page>
  );
}