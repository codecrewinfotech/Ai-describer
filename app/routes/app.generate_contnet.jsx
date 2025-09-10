
import { useFetcher, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";

import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Thumbnail,
  Select,
  TextField,
  Button,
  Banner,
  Spinner,
  ButtonGroup,
  Toast,
  Frame,
  Icon,
  BlockStack,
  Badge,
  InlineStack,
 
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { authenticate } from "../shopify.server";
import {
  DeleteIcon
} from '@shopify/polaris-icons';

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const fetchPaginated = async (query, dataPath) => {
    let items = [];
    let hasNextPage = true;
    let afterCursor = null;

    while (hasNextPage) {
      const response = await admin.graphql(query, {
        variables: { first: 100, after: afterCursor }
      });
      const json = await response.json();
      const edges = json.data[dataPath].edges;
      
      items = [...items, ...edges.map(edge => edge.node)];
      hasNextPage = json.data[dataPath].pageInfo.hasNextPage;
      afterCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    }
    return items;
  };

  const productQuery = `
    query getProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            description
            descriptionHtml
            seo {
              description
              title
            }
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

  const collectionQuery = `
    query getCollections($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            description
            descriptionHtml
            seo {
              description
              title
            }
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

  const [products, collections] = await Promise.all([
    fetchPaginated(productQuery, 'products'),
    fetchPaginated(collectionQuery, 'collections')
  ]);

  return json({ products, collections,  endpoint: process.env.AI_DESCRIBER_ENDPOINT, });
  
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { action, itemId, pageType, seoDescription, description } = body;

    if (action !== "updateContent" || !itemId || !pageType) {
      return json({
        success: false,
        error: "Invalid request parameters"
      }, { status: 400 });
    }

    const mutations = {
      product: {
        query: `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
                description
                descriptionHtml
                seo {
                  description
                  title
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: {
            id: itemId,
            ...(description && { descriptionHtml: description }),
            ...(seoDescription && { seo: { description: seoDescription } })
          }
        }
      },
      collection: {
        query: `
          mutation collectionUpdate($input: CollectionInput!) {
            collectionUpdate(input: $input) {
              collection {
                id
                title
                description
                descriptionHtml
                seo {
                  description
                  title
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: {
            id: itemId,
            ...(description && { descriptionHtml: description }),
            ...(seoDescription && { seo: { description: seoDescription } })
          }
        }
      }
    };

    const mutation = mutations[pageType];
    if (!mutation) {
      return json({
        success: false,
        error: "Invalid page type"
      }, { status: 400 });
    }

    const response = await admin.graphql(mutation.query, {
      variables: mutation.variables
    });
    const result = await response.json();
    const data = result.data?.[`${pageType}Update`];

    if (!data) {
      return json({
        success: false,
        error: "No data returned from GraphQL mutation"
      }, { status: 500 });
    }

    if (data.userErrors?.length > 0) {
      return json({
        success: false,
        error: data.userErrors.map(err => `${err.field}: ${err.message}`).join(", ")
      }, { status: 400 });
    }

    return json({
      success: true,
      message: `Content updated successfully for ${pageType}!`,
      updatedItem: data[pageType]
    });

  } catch (error) {
    console.error("Content Update Error:", error);
    return json({
      success: false,
      error: `Failed to update content: ${error.message}`
    }, { status: 500 });
  }
}

// Skeleton Loader Components
const StatsSkeleton = () => (
  <div style={{
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "32px",
  }}>
   <BlockStack gap="400">
  <div>
    <div style={{
      height: "28px",
      width: "300px",
      backgroundColor: "#e0e0e0",
      borderRadius: "8px",
      marginBottom: "8px",
      animation: "shimmer 2s linear infinite",
    }} />
    <div style={{
      height: "18px",
      width: "400px",
      backgroundColor: "#e6e6e6",
      borderRadius: "6px",
      animation: "shimmer 2s linear infinite",
    }} />
  </div>
  
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "24px",
    marginTop: "24px",
  }}>
    {[1, 2, 3].map((index) => (
      <div 
        key={index} 
        style={{
          padding: "20px",
          backgroundColor: "#f0f0f0",
          borderRadius: "12px",
          textAlign: "center",
          border: "1px solid #e5e5e5",
        }}
      >
        <div style={{
          width: "32px",
          height: "32px",
          backgroundColor: "#e0e0e0",
          borderRadius: "50%",
          margin: "0 auto 12px",
          animation: "shimmer 2s linear infinite",
        }} />
        <div style={{
          height: "32px",
          width: "60px",
          backgroundColor: "#e0e0e0",
          borderRadius: "8px",
          margin: "0 auto 8px",
          animation: "shimmer 2s linear infinite",
        }} />
        <div style={{
          height: "16px",
          width: "120px",
          backgroundColor: "#e0e0e0",
          borderRadius: "4px",
          margin: "0 auto",
          animation: "shimmer 2s linear infinite",
        }} />
      </div>
    ))}
  </div>
</BlockStack>

<style>
{`
@keyframes shimmer {
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
}
div[style*="animation: shimmer"] {
  background: linear-gradient(
    90deg,
    #e0e0e0 25%,
    #f5f5f5 50%,
    #e0e0e0 75%
  );
  background-size: 400px 100%;
}
`}
</style>

  </div>
);

const FilterSkeleton = () => (
  <Card style={{
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
  }}>
    <div style={{ padding: "24px" }}>
      <BlockStack gap="400">
        <div style={{
          height: "24px",
          width: "250px",
          backgroundColor: "#f3f4f6",
          borderRadius: "6px",
          marginBottom: "12px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />

        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "20px",
          alignItems: "end",
        }}>
          {[1, 2, 3].map((index) => (
            <div key={index}>
              <div style={{
                height: "16px",
                width: "60px",
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
          ))}
        </div>
      </BlockStack>
    </div>
  </Card>
);

const ItemCardSkeleton = () => (
  <Card>
    <div style={{ padding: "20px" }}>
      <InlineStack gap="400" align="space-between">
        <InlineStack gap="300" align="center">
          <div style={{
            width: "60px",
            height: "60px",
            backgroundColor: "#f3f4f6",
            borderRadius: "12px",
            animation: "shimmer 2s ease-in-out infinite",
          }} />
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <BlockStack gap="200">
              <div style={{
                height: "20px",
                width: "200px",
                backgroundColor: "#f3f4f6",
                borderRadius: "4px",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
              <div style={{
                height: "16px",
                width: "80px",
                backgroundColor: "#f9fafb",
                borderRadius: "12px",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
            </BlockStack>
          </div>
        </InlineStack>
        
        <div style={{
          height: "36px",
          width: "120px",
          backgroundColor: "#f3f4f6",
          borderRadius: "6px",
          animation: "shimmer 2s ease-in-out infinite",
        }} />
      </InlineStack>
    </div>
  </Card>
);

const LoadingSkeleton = () => (
  <Page>
    <TitleBar title="📝 AI-Modified Content Dashboard" />
    
    <BlockStack gap="600">
      <StatsSkeleton />
      <FilterSkeleton />
      
      <BlockStack gap="300">
        {[1, 2, 3, 4, 5].map((index) => (
          <ItemCardSkeleton key={index} />
        ))}
      </BlockStack>
    </BlockStack>
    
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
);

export default function ProductsPage() {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  // Show skeleton while loading
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const { products, collections, endpoint } = useLoaderData();
  const [state, setState] = useState({
    pageType: "product",
    contentType: "description",
    searchTerm: "",
    selectedItem: null,
    showDropdown: false,
    seoKeywords: "",
    isLoading: false,
    apiResponse: null,
    error: null,
    isEditing: false,
    editedContent: "",
    isPublishing: false,
    successMessage: null
  });
    const navigate = useNavigate();
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [filteredItems, setFilteredItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const API_ENDPOINT = `${endpoint}/generate-content`;
  const ENDPOINT = `${endpoint}/content`;
  const contentTypeOptions = [
    { label: "Product/Collection Description", value: "description" },
    { label: "SEO Meta Description", value: "seo-description" },
  ];
  const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));
  const resetState = () => updateState({
    searchTerm: "",
    selectedItem: null,
    showDropdown: false,
    apiResponse: null,
    error: null,
    successMessage: null,
    isEditing: false,
    editedContent: ""
  });

  const clearSelection = () => updateState({
    searchTerm: "",
    selectedItem: null,
    showDropdown: false,
    error: null
  });

// Fixed getGeneratedText function to handle SEO descriptions properly
const getGeneratedText = (response, contentType = null) => {
  let result =
    typeof response === "string"
      ? response
      : typeof response?.message === "string"
      ? response.message
      : JSON.stringify(response?.message || response || "", null, 2); 
  
  // Clean up basic formatting issues
  result = result.replace(/,,/g, " ");  
  result = result.replace(/,\s*/g, " ");   
  result = result.replace(/„|"|"|"|"/g, ""); 
  result = result.replace(/\[|\]/g, ""); 

  // For SEO descriptions, return clean text without HTML tags
  if (contentType === "seo-description" || state.contentType === "seo-description") {
    result = result.replace(/<[^>]*>/g, '');
    result = result.replace(/\\n/g, ' ');
    result = result.replace(/\\/g, '');
    result = result.replace(/,,/g, " ");  
    result = result.replace(/,\s*/g, " ");   
    result = result.replace(/„|"|"|"|"/g, ""); 
    result = result.replace(/\[|\]/g, ""); 
    return result.trim().replace(/\s+/g, ' ');
  }

  // For regular descriptions, process with HTML formatting
  const bulletPoints = result.match(/•.+/g);
  if (bulletPoints) {
    const listItems = bulletPoints.map((point) => `<li>${point.replace(/•\s*/, "")}</li>`).join("");
    const ul = `<ul>${listItems}</ul>`;
    result = result.replace(/•.+/g, "");
    result += ul;
  }
  
  result = result
    .split("\n")
    .map((para) => para.trim())
    .filter((para) => para && !para.startsWith("<li>"))
    .map((para) => `<p>${para}</p>`)
    .join("");

  return result;
};


  const showToast = useCallback((message, isError = false) => {
    setToastMessage(message);
    setToastError(isError);
    setToastActive(true);
  }, []);

  const hideToast = useCallback(() => {
    setToastActive(false);
  }, []);

  const handlePageTypeChange = (value) => {
    updateState({ pageType: value });
    setFilteredItems([]);
    setSuggestions([]);
    resetState();
  };

  const handleContentTypeChange = (value) => {
    updateState({
      contentType: value,
      apiResponse: null,
      editedContent: ""
    });
  };

  const handleInputChange = (value) => {
    updateState({ searchTerm: value });
    
    // If user clears the search input, also clear the selection
    if (value.trim() === "" && state.selectedItem) {
      updateState({ selectedItem: null });
    }
    
    const items = state.pageType === "product" ? products : collections;

    if (value.trim() === "") {
      setSuggestions(items.slice(0, 10));
      setFilteredItems([]);
    } else {
      const filtered = items.filter((item) =>
        item.title.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 10));
      setFilteredItems(filtered);
    }
  };

  const handleInputFocus = () => {
    const items = state.pageType === "product" ? products : collections;
    if (state.searchTerm.trim() === "") {
      setSuggestions(items.slice(0, 10));
    }
    updateState({ showDropdown: true });
  };

  const handleSuggestionClick = (item) => {
    updateState({
      searchTerm: item.title,
      selectedItem: item,
      showDropdown: false,
      apiResponse: null,
      error: null,
      successMessage: null,
      isEditing: false,
      editedContent: ""
    });
    setSuggestions([]);
  };

  const handleGenerateContent = async () => {
  
    if (!state.selectedItem) {
      updateState({ error: "Please select a product or collection before generating content." });
      return;
    }
    
    if (!state.seoKeywords.trim()) {
      updateState({ error: "Please enter SEO keywords before generating content." });
      return;
    }
    
    updateState({
      isLoading: true,
      error: null,
      apiResponse: null,
      successMessage: null,
      isEditing: false,
      editedContent: ""
    });

    try {
      const requestBody = {
        seoKeywords: state.seoKeywords.trim(),
        pageType: state.pageType,
        contentType: state.contentType
      };

      if (state.selectedItem) {
        if (state.pageType === "product") {
          requestBody.productName = state.selectedItem.title;
        } else if (state.pageType === "collection") {
          requestBody.collectionName = state.selectedItem.title;
        }
      }

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
       const data = await response.json();

      if (!response.ok) {
              if(data.statusCode === 429){
throw new Error(
`You've reached the current usage limit. Please try again later.`)
              }
        throw new Error(`API request failed: ${data.message} ${response.statusText}`);
        
      }


     
      const generatedText = getGeneratedText(data, state.contentType);
      
      updateState({ 
        apiResponse: data, 
        editedContent: generatedText 
      });
      
      showToast("Content generated successfully!");

    } catch (err) {
      console.error("API Error:", err);
      updateState({ 
        error: err.message || "Failed to generate content. Please try again." 
      });
    } finally {
      updateState({ isLoading: false });
    }
  };

  const handleEditClick = () => {
    updateState({ isEditing: true });
    if (!state.editedContent) {
      updateState({ editedContent: getGeneratedText(state.apiResponse, state.contentType) });
    }
  };

  const handleSaveEdit = () => {
    updateState({ 
      isEditing: false, 
      apiResponse: state.editedContent 
    });
    showToast("Changes saved successfully!");
  };

  const handleCancelEdit = () => {
    updateState({
      isEditing: false,
      editedContent: getGeneratedText(state.apiResponse, state.contentType)
    });
  };

const handlePublish = async () => {
  if (!state.selectedItem) {
    updateState({ error: "Please select a product or collection to publish content." });
    return;
  }

  if (!state.apiResponse && !state.editedContent) {
    updateState({ error: "Please generate content before publishing." });
    return;
  }

  updateState({ 
    isPublishing: true, 
    error: null, 
    successMessage: null 
  });

  try {
    console.log("=== PUBLISH PROCESS STARTED ===");
    console.log("Selected Item:", state.selectedItem);
    console.log("Content Type:", state.contentType);
    
    const generatedContent = state.editedContent || getGeneratedText(state.apiResponse, state.contentType);
    
    // **FIXED**: Get the correct original content in HTML format based on content type
    let oldContent;
    if (state.contentType === "seo-description") {
      // SEO descriptions - keep original logic unchanged
      oldContent = state.selectedItem.seo?.description || "";
      console.log("Old SEO Description:", oldContent);
    } else {
      // **ONLY CHANGE**: For descriptions, prioritize descriptionHtml to get HTML formatted content
      oldContent = state.selectedItem.descriptionHtml || state.selectedItem.description || "";
      console.log("Old Description (HTML format):", oldContent);
    }
    
    console.log("New Content:", generatedContent);
    
    // Prepare data for the external API endpoint
    const externalApiPayload = {
      originalContent: oldContent, // **FIXED**: Now gets HTML formatted content for descriptions
      contentType: state.contentType === "seo-description" ? "seo-description" : "description",
      contentOrigin: state.pageType,
      originId: state.selectedItem.id,
    };

    console.log("External API Payload:", externalApiPayload);

    // Send to external endpoint first
    const externalResponse = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(externalApiPayload),
    });

    if (!externalResponse.ok) {
      throw new Error(`External API request failed: ${externalResponse.status} ${externalResponse.statusText}`);
    }

    const externalData = await externalResponse.json();
    console.log("External API response:", externalData);
    

    // Prepare payload for Shopify update
    const updatePayload = {
      action: "updateContent",
      itemId: state.selectedItem.id,
      pageType: state.pageType
    };

    if (state.contentType === "seo-description") {
      updatePayload.seoDescription = generatedContent;
    } else {
      updatePayload.description = generatedContent;
    }

    console.log("Shopify Update Payload:", updatePayload);

    // Update local state
    const updatedItem = { ...state.selectedItem };
    if (state.contentType === "seo-description") {
      updatedItem.seo = { 
        ...updatedItem.seo, 
        description: generatedContent 
      };
    } else {
      updatedItem.description = generatedContent;
      updatedItem.descriptionHtml = generatedContent;
    }

    console.log("Updated Item:", updatedItem);

    updateState({
      selectedItem: updatedItem,
      isPublishing: false
    });

    const contentTypeLabel = state.contentType === "seo-description" 
      ? "SEO meta description" 
      : "description";
    
    showToast(`${contentTypeLabel} published successfully for ${state.selectedItem.title}!`);

    // Update Shopify (send to current route action)
    try {

      const shopifyResponse = await fetch("", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(updatePayload),
      });

      console.log("Shopify Response Status:", shopifyResponse.status);
      console.log("Shopify Response OK:", shopifyResponse.ok);

      if (!shopifyResponse.ok) {
        console.error("Failed to update content on Shopify");
        const errorText = await shopifyResponse.text();
        console.error("Shopify Error Response:", errorText);
      } else {
        const shopifyResult = await shopifyResponse.json();
        console.log("Shopify Success Response:", shopifyResult);
      }
    } catch (shopifyErr) {
      console.error("Error updating Shopify content:", shopifyErr);
    }

  } catch (err) {
    console.error("Publish Error:", err);
    updateState({ 
      error: err.message || "Failed to publish content. Please try again.",
      isPublishing: false 
    });
    showToast("Failed to publish content. Please try again.", true);
  }
};
 useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
        inputRef.current && !inputRef.current.contains(event.target)) {
        updateState({ showDropdown: false });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
   const handleGenerate = () => {
    navigate("/app/dashboard");
  };
  const DropdownItem = ({ item, onClick }) => (
    <div
      onClick={() => onClick(item)}
      style={{
        padding: "12px 16px",
        cursor: "pointer",
        borderBottom: "1px solid #f4f6f8",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        transition: "background-color 0.2s ease"
      }}
      onMouseEnter={(e) => e.target.style.backgroundColor = "#f9fafb"}
      onMouseLeave={(e) => e.target.style.backgroundColor = "white"}
    >
      <Thumbnail
        source={
          state.pageType === "product"
            ? item.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
            : item.image?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
        }
        alt={item.title}
        size="small"
      />
      <Text variant="bodyMd" fontWeight="medium">
        {item.title}
      </Text>
    </div>
  );

  const EmptyStateContent = () => (
    <Layout.Section>
      <Card>
        <div style={{textAlign: "center",padding: "60px 40px", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",borderRadius: "12px",border: "2px dashed #e2e8f0"
        }}>
          <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
            <div style={{ width: "80px",height: "80px",borderRadius: "50%",background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",display: "flex",alignItems: "center",justifyContent: "center",marginBottom: "16px", fontSize: "32px", color: "white"
            }}>
              ✨
            </div>
          </div>

          <Text variant="bodyLg" color="subdued" style={{
            marginBottom: "32px",
            maxWidth: "500px",
            margin: "0 auto 32px"
          }}>
            Generate compelling product descriptions and SEO meta descriptions using advanced AI. 
            Select your content type, choose an item, add keywords, and let our AI create optimized content for your store.
          </Text>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "24px",
            marginTop: "40px",
            maxWidth: "600px",
            margin: "40px auto 0"
          }}>
            <div style={{
              padding: "24px",
              background: "white",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{
                marginBottom: "12px",
                display: "flex",
                justifyContent: "center",
                fontSize: "24px"
              }}>
                🔍
              </div>
              <Text variant="headingMd" as="h3" style={{
                marginBottom: "8px",
                textAlign: "center"
              }}>
                1. Search & Select
              </Text>
              <Text variant="bodyMd" color="subdued" style={{ textAlign: "center" }}>
                Choose a product or collection from your store
              </Text>
            </div>

            <div style={{
              padding: "24px",
              background: "white",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{
                marginBottom: "12px",
                display: "flex",
                justifyContent: "center",
                fontSize: "24px"
              }}>
                ✏️
              </div>
              <Text variant="headingMd" as="h3" style={{
                marginBottom: "8px",
                textAlign: "center"
              }}>
                2.Generate 
              </Text>
              <Text variant="bodyMd" color="subdued" style={{ textAlign: "center" }}>
                AI creates optimized descriptions based on your keywords
              </Text>
            </div>

            <div style={{
              padding: "24px",
              background: "white",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{
                marginBottom: "12px",
                display: "flex",
                justifyContent: "center",
                fontSize: "24px"
              }}>
                🚀
              </div>
              <Text variant="headingMd" as="h3" style={{
                marginBottom: "8px",
                textAlign: "center"
              }}>
                3. Review & Publish
              </Text>
              <Text variant="bodyMd" color="subdued" style={{ textAlign: "center" }}>
                Edit if needed and publish directly to Shopify
              </Text>
            </div>
             <div style={{
            padding: "24px",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            border: "1px solid #e5e7eb"
          }}>
            <div style={{
              marginBottom: "12px",
              display: "flex",
              justifyContent: "center",
              fontSize: "24px"
            }}>
              🔄
            </div>
            <Text variant="headingMd" as="h3" style={{
              marginBottom: "8px",
              textAlign: "center"
            }}>
              4. Publish & Refresh
            </Text>
            <Text variant="bodyMd" color="subdued" style={{ textAlign: "center" }}>
             After you publish the data, go to the admin product page and reload it, the data will then be displayed.
            </Text>
          </div>
          </div>
          

          <div style={{
            marginTop: "40px",
            padding: "20px",
            background: "rgba(99, 102, 241, 0.1)",
            borderRadius: "8px",
            border: "1px solid rgba(99, 102, 241, 0.2)"
          }}>
            <Text variant="bodyMd" style={{
              color: "#4f46e5",
              fontWeight: "medium"
            }}>
              💡 Pro Tip: Use specific, relevant keywords for better SEO results and more engaging content!
            </Text>
          </div>
        </div>
      </Card>
    </Layout.Section>
  );

  const toastMarkup = toastActive ? (
    <Toast
      content={toastMessage}
      onDismiss={hideToast}
      error={toastError}
      duration={4000}
    />
  ) : null;

  return (
    <Frame>
      <Page title="Content Generator"
        backAction={{ 
    content: "Back", 
    onAction: handleGenerate 
  }}>
        {toastMarkup}       
        <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                  <div style={{ flex: "0 0 320px", maxWidth: "400px", position: "sticky", top: "20px", alignSelf: "flex-start" }}>

            
            <Card title="Quick Generator" sectioned >
              <div style={{ marginBottom: "16px" }}>
                <Select
                  label="Page Type"
                  options={[
                    { label: "Product", value: "product" },
                    { label: "Collection", value: "collection" }
                  ]}
                  onChange={handlePageTypeChange}
                  value={state.pageType}
                  
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <Select
                  label="Content Type"
                  options={contentTypeOptions}
                  onChange={handleContentTypeChange}
                  value={state.contentType}
                />
              </div>
              <div style={{ marginBottom: "16px", position: "relative" }}>
                <div ref={inputRef}>
                  <TextField
                    label={`Search ${state.pageType}`}
                    value={state.searchTerm}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    placeholder={`Enter ${state.pageType} name`}
                    autoComplete="off"
                    helpText={
                      state.selectedItem
                        ? `Selected: ${state.selectedItem.title}`
                        : `Select the ${state.pageType} where you want to add the description.`
                    }
                  />
                </div>
                {state.showDropdown && suggestions.length > 0 && (
                  <div
                    ref={dropdownRef}
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: "white",
                      border: "1px solid #dfe3e8",
                      borderRadius: "8px",
                      maxHeight: "250px",
                      overflowY: "auto",
                      zIndex: 1000,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)"
                    }}
                  >
                    {suggestions.map((item) => (
                      <DropdownItem
                        key={item.id}
                        item={item}
                        onClick={handleSuggestionClick}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: "16px" }}>
                <TextField
                  label="SEO Keywords"
                  value={state.seoKeywords}
                  onChange={(value) => updateState({ seoKeywords: value })}
                  placeholder="Enter keywords separated by commas"
                  autoComplete="off"
                  helpText="Add relevant keywords to improve content quality and SEO performance"
                />
              </div>
              <Button
                primary
                onClick={handleGenerateContent}
                loading={state.isLoading}
                disabled={!state.selectedItem || !state.seoKeywords.trim()}
                fullWidth
                size="large"
              >
                {state.isLoading ? "Generating..." : "   ✨ Generate"}
              </Button>
            </Card>
          </div>
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <Layout>
              {state.error && (
                <Layout.Section>
                  <Banner status="critical" title="Error">
                    <p>{state.error}</p>
                  </Banner>
                </Layout.Section>
              )}
              {state.isLoading && (
                <Layout.Section>
                  <Card>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "40px 20px",
                      gap: "16px",
                      background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                      borderRadius: "12px"
                    }}>
                      <Spinner size="large" />
                      <div>
                        <Text variant="headingMd" as="h3" style={{ marginBottom: "4px" }}>
                          Generating Content...
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Creating {state.contentType === "seo-description" ? "SEO meta description" : "description"}
                          {state.selectedItem ? ` for "${state.selectedItem.title}"` : ""}
                        </Text>
                      </div>
                    </div>
                  </Card>
                </Layout.Section>
              )}
          {state.apiResponse && (
  <Layout.Section>
    <Card
      title={`Generated ${
        state.contentType === "seo-description"
          ? "SEO Meta Description"
          : "Description"
      }`}
    >
      <div style={{ padding: "16px 0" }}>
        {state.isEditing ? (
          <div>
            <TextField
              label={`Edit ${
                state.contentType === "seo-description"
                  ? "SEO Meta Description"
                  : "Description"
              }`}
              value={state.editedContent}
              onChange={(value) => updateState({ editedContent: value })}
              multiline={state.contentType === "description" ? 6 : 4}
              autoComplete="off"
            />
            <div style={{ marginTop: "16px" }}>
              <ButtonGroup>
                <Button primary onClick={handleSaveEdit}>
                  Save Changes
                </Button>
                <Button onClick={handleCancelEdit}>Cancel</Button>
              </ButtonGroup>
            </div>
          </div>
        ) : (
          <div>
            {/* Fixed display logic for SEO descriptions vs regular descriptions */}
            {state.contentType === "seo-description" ? (
              <div
                style={{
                  padding: "20px",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  marginBottom: "16px",
                  whiteSpace: "pre-wrap",
                  fontSize: "14px",
                  lineHeight: "1.5"
                }}
              >
                {state.editedContent || getGeneratedText(state.apiResponse, state.contentType)}
              </div>
            ) : (
              <div
                style={{
                  padding: "20px",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  marginBottom: "16px",
                }}
                dangerouslySetInnerHTML={{
                  __html: state.editedContent || getGeneratedText(state.apiResponse, state.contentType),
                }}
              />
            )}

            <ButtonGroup>
              <Button
                primary
                onClick={handlePublish}
                loading={state.isPublishing}
                disabled={!state.selectedItem || state.isPublishing}
              >
                {state.isPublishing ? "Publishing..." : "Publish to Shopify"}
              </Button>
              <Button onClick={handleEditClick}>Edit</Button>
            </ButtonGroup>
          </div>
        )}
      </div>
    </Card>
  </Layout.Section>
)}

              {state.selectedItem && (
                <Layout.Section>
                   <div style={{ marginBottom: "16px" }}>
                  <Card                  
                    title="Selected Item"
                    secondaryFooterActions={[
                      { content: "Clear Selection", onAction: clearSelection }
                    ]}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      padding: "4px 0",
                     
                    }}>
                      <Thumbnail
                        source={
                          state.pageType === "product"
                            ? state.selectedItem.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
                            : state.selectedItem.image?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
                        }
                        alt={state.selectedItem.title}
                        size="medium"
                      />
                      
                      <div style={{ flex: 1 }}>
                        <Text variant="headingLg"  style={{ marginBottom: "8px" , fontSize: "20px"}}>
                         <span style={{ fontSize: "14px"}} >{state.selectedItem.title}</span> 
                        </Text>
                      </div>
                      
                      <div onClick={resetState} style={{ cursor: "pointer", backgroundColor: "#f6f6f7",padding: "6px", borderRadius: "6px", display: "inline-flex", alignItems: "center",}}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ebebeb")}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f6f6f7")}
><Icon source={DeleteIcon}tone="base"/>
            
                      </div>
                    </div>
                  </Card>
</div>
                </Layout.Section>
              )}
              {filteredItems.length > 0 && !state.selectedItem && (
                <Layout.Section>
                  <Card title={`Search Results (${filteredItems.length} found)`}>
                    <ResourceList
                      resourceName={{
                        singular: state.pageType,
                        plural: state.pageType + "s"
                      }}
                      items={filteredItems}
                      renderItem={(item) => {
                        const media = (
                          <Thumbnail
                            source={
                              state.pageType === "product"
                                ? item.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
                                : item.image?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-image.png"
                            }
                            alt={item.title}
                            size="medium"
                          />
                        );


                        return (
                          <ResourceItem
                            id={item.id}
                            media={media}
                            onClick={() => handleSuggestionClick(item)}
                            shortcutActions={[
                              {
                                content: 'Select',
                                onClick: () => handleSuggestionClick(item)
                              }
                            ]}
                          >
                            <Text variant="bodyLg" fontWeight="semibold" as="h3" style={{ marginBottom: "8px" }}>
                              {item.title}
                            </Text>
                          </ResourceItem>
                        );
                      }}
                    />
                  </Card>
                </Layout.Section>
              )}
              {!state.isLoading &&  !state.apiResponse &&  !state.error &&  filteredItems.length === 0 && !state.selectedItem && (
                <EmptyStateContent />
              )}
            </Layout>
          </div>
        </div>
      </Page>
    </Frame>
  );
}